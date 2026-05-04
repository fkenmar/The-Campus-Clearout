<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Connect to the database using your central db.php file
require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["message" => "Database connection failed"]);
    exit;
}

// 1. Authenticate User Token
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid token"]);
    exit;
}
$seller_username = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();

$conn->query("CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    listing_id INT DEFAULT NULL,
    reviewer_username VARCHAR(100) NOT NULL,
    target_username VARCHAR(100) NOT NULL,
    rating_score INT NOT NULL DEFAULT 0,
    review_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_review (reviewer_username, listing_id)
)");

// 2. Parse incoming JSON
$data = json_decode(file_get_contents("php://input"), true);
$chat_id = $data['chat_id'] ?? null;
$listing_id = $data['listing_id'] ?? null; 
$rating = (int)($data['rating'] ?? 0);
$note = $data['note'] ?? '';

if (!$chat_id || !$listing_id) {
    http_response_code(400);
    echo json_encode(["message" => "Missing chat or listing ID"]);
    exit;
}

// 3. Find the Buyer's Username from the 'chats' table
$chatStmt = $conn->prepare("SELECT buyer_username, seller_username FROM chats WHERE id = ?");
$chatStmt->bind_param("i", $chat_id);
$chatStmt->execute();
$chatRow = $chatStmt->get_result()->fetch_assoc();
$chatStmt->close();

if (!$chatRow) {
    http_response_code(404);
    echo json_encode(["message" => "Chat not found"]);
    exit;
}

// Security Check: Ensure the logged-in user is actually the seller for this chat
if ($chatRow['seller_username'] !== $seller_username) {
    http_response_code(403);
    echo json_encode(["message" => "Only the seller can mark this as sold"]);
    exit;
}

$buyer_username = $chatRow['buyer_username'];

// --- ADD THIS NEW BLOCK TO PREVENT DUPLICATES ---
if (!is_array($listing_id)) {
    $checkStmt = $conn->prepare("SELECT active FROM listings WHERE id = ?");
    $checkStmt->bind_param("i", $listing_id);
    $checkStmt->execute();
    $checkRes = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();
    
    if ($checkRes && (int)$checkRes['active'] === 0) {
        http_response_code(400);
        echo json_encode(["message" => "This item is already marked as sold."]);
        exit;
    }
}
// ------------------------------------------------

// Start Transaction to ensure everything saves together
$conn->begin_transaction();

try {
    $completed_titles = [];

    // Make listing_id an array if it's not already
    $listing_ids = is_array($listing_id) ? $listing_id : [$listing_id];
    
    foreach ($listing_ids as $lid) {
        $safe_lid = is_numeric($lid) ? (int)$lid : null;
        if (!$safe_lid) continue;
        
        // Record the Review
        if ($rating > 0 && $rating <= 5) {
            $reviewStmt = $conn->prepare("
                INSERT INTO reviews (listing_id, reviewer_username, target_username, rating_score, review_text)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE rating_score = VALUES(rating_score), review_text = VALUES(review_text)
            ");
            $reviewStmt->bind_param("issis", $safe_lid, $seller_username, $buyer_username, $rating, $note);
            $reviewStmt->execute();
            $reviewStmt->close();
        }

        // Mark Listing(s) as Sold/Inactive
        $updateStmt = $conn->prepare("UPDATE listings SET active = 0 WHERE id = ? AND username = ?");
        $updateStmt->bind_param("is", $safe_lid, $seller_username);
        $updateStmt->execute();
        $updateStmt->close();
        
        $titleStmt = $conn->prepare("SELECT title FROM listings WHERE id = ?");
        $titleStmt->bind_param("i", $safe_lid);
        $titleStmt->execute();
        $titleResult = $titleStmt->get_result();
        if ($titleResult->num_rows > 0) {
            $completed_titles[] = $titleResult->fetch_assoc()["title"];
        }
        $titleStmt->close();
    }

    // 6. Post a System Message confirming the transaction and prompting the buyer
    $item_name = count($completed_titles) > 1 ? count($completed_titles) . " bundled items" : ($completed_titles[0] ?? "An item");
    $sysText = "System: {$seller_username} (seller) initiated the transaction completion for {$item_name}. Waiting for the buyer to click 'Complete Transaction'.";
    $sysMsgStmt = $conn->prepare("INSERT INTO messages (chat_id, sender_username, message, is_system) VALUES (?, ?, ?, 1)");
    $sysMsgStmt->bind_param("iss", $chat_id, $seller_username, $sysText);
    $sysMsgStmt->execute();
    $sysMsgStmt->close();

    $conn->commit();
    http_response_code(200);
    echo json_encode(["message" => "Transaction successful"]);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(["message" => "Server error processing transaction: " . $e->getMessage()]);
}

$conn->close();
?>
