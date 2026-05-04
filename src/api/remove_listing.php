<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["message" => "Database connection failed"]);
    exit;
}

// Ensure soft-delete and system message columns exist
$conn->query("ALTER TABLE chat_listings ADD COLUMN buyer_removed TINYINT(1) DEFAULT 0");
$conn->query("ALTER TABLE chat_listings ADD COLUMN seller_removed TINYINT(1) DEFAULT 0");
$conn->query("ALTER TABLE messages ADD COLUMN is_system TINYINT(1) DEFAULT 0");

// Auth
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare(
    "SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())"
);
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$me = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();

$data = json_decode(file_get_contents("php://input"), true);
$chat_id = isset($data['chat_id']) ? intval($data['chat_id']) : 0;
$listing_id = isset($data['listing_id']) ? intval($data['listing_id']) : 0;

if ($chat_id < 1 || $listing_id < 1) {
    http_response_code(400);
    echo json_encode(["message" => "Valid chat_id and listing_id are required"]);
    exit;
}

// Verify user is a participant
$chatStmt = $conn->prepare(
    "SELECT buyer_username, seller_username FROM chats WHERE id = ? AND (buyer_username = ? OR seller_username = ?)"
);
$chatStmt->bind_param("iss", $chat_id, $me, $me);
$chatStmt->execute();
$chatRow = $chatStmt->get_result()->fetch_assoc();
$chatStmt->close();

if (!$chatRow) {
    http_response_code(403);
    echo json_encode(["message" => "Access denied"]);
    exit;
}

$isBuyer = ($chatRow['buyer_username'] === $me);
$col = $isBuyer ? 'buyer_removed' : 'seller_removed';
if (!in_array($col, ['buyer_removed', 'seller_removed'], true)) { http_response_code(400); exit; }

// Set the removal flag for this user's side
$updateStmt = $conn->prepare("UPDATE chat_listings SET $col = 1 WHERE chat_id = ? AND listing_id = ?");
$updateStmt->bind_param("ii", $chat_id, $listing_id);
$updateStmt->execute();
$updateStmt->close();

// If buyer removed, post a system message to the chat
if ($isBuyer) {
    $titleStmt = $conn->prepare("SELECT title FROM listings WHERE id = ?");
    $titleStmt->bind_param("i", $listing_id);
    $titleStmt->execute();
    $titleRow = $titleStmt->get_result()->fetch_assoc();
    $titleStmt->close();
    $listing_title = $titleRow['title'] ?? 'a listing';

    $sysMsg = "$me removed \"$listing_title\" from the conversation";
    $msgStmt = $conn->prepare("INSERT INTO messages (chat_id, sender_username, message, is_system) VALUES (?, ?, ?, 1)");
    $msgStmt->bind_param("iss", $chat_id, $me, $sysMsg);
    $msgStmt->execute();
    $msgStmt->close();
}

// If both sides have removed, delete the row entirely
$cleanupStmt = $conn->prepare(
    "DELETE FROM chat_listings WHERE chat_id = ? AND listing_id = ? AND buyer_removed = 1 AND seller_removed = 1"
);
$cleanupStmt->bind_param("ii", $chat_id, $listing_id);
$cleanupStmt->execute();

if ($cleanupStmt->affected_rows > 0) {
    // Also nullify the legacy listing_id pointer to prevent "zombie" fallback resurrection
    $nullifyStmt = $conn->prepare("UPDATE chats SET listing_id = 0 WHERE id = ? AND listing_id = ?");
    $nullifyStmt->bind_param("ii", $chat_id, $listing_id);
    $nullifyStmt->execute();
    $nullifyStmt->close();
}

$cleanupStmt->close();

// If buyer removed and all listings in chat are now buyer-removed, post a final system message
if ($isBuyer) {
    $countStmt = $conn->prepare(
        "SELECT COUNT(*) AS total, SUM(buyer_removed) AS removed FROM chat_listings WHERE chat_id = ?"
    );
    $countStmt->bind_param("i", $chat_id);
    $countStmt->execute();
    $countRow = $countStmt->get_result()->fetch_assoc();
    $countStmt->close();

    if ((int)$countRow['total'] > 0 && (int)$countRow['total'] === (int)$countRow['removed']) {
        $allMsg = "All listings have been removed from this conversation.";
        $allMsgStmt = $conn->prepare("INSERT INTO messages (chat_id, sender_username, message, is_system) VALUES (?, ?, ?, 1)");
        $allMsgStmt->bind_param("iss", $chat_id, $me, $allMsg);
        $allMsgStmt->execute();
        $allMsgStmt->close();
    }
}

$conn->close();
echo json_encode(["message" => "Listing removed"]);
?>
