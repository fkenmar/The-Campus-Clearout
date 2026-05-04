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

// 1. Authenticate User Token
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    exit;
}
$reviewer_username = $tokenResult->fetch_assoc()["username"];
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

if (!$chat_id || !$listing_id || $rating < 1 || $rating > 5) {
    http_response_code(400);
    echo json_encode(["message" => "Missing required fields or rating"]);
    exit;
}

// 3. Find the Target Username (the other person in the chat)
$chatStmt = $conn->prepare("SELECT buyer_username, seller_username FROM chats WHERE id = ?");
$chatStmt->bind_param("i", $chat_id);
$chatStmt->execute();
$chatRow = $chatStmt->get_result()->fetch_assoc();
$chatStmt->close();

if (!$chatRow) {
    http_response_code(404);
    exit;
}

$isBuyer = ($chatRow['buyer_username'] === $reviewer_username);
$isSeller = ($chatRow['seller_username'] === $reviewer_username);

if (!$isBuyer && !$isSeller) {
    http_response_code(403);
    echo json_encode(["message" => "You are not a participant in this chat"]);
    exit;
}

$target_username = $isBuyer ? $chatRow['seller_username'] : $chatRow['buyer_username'];

// 4. Anti-Spam: Check if this user already reviewed this specific listing
$safe_listing_id = is_numeric($listing_id) ? (int)$listing_id : null;
if (!$safe_listing_id) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid listing ID"]);
    exit;
}

$verifyStmt = $conn->prepare("
    SELECT l.id
    FROM listings l
    JOIN chat_listings cl ON l.id = cl.listing_id
    WHERE cl.chat_id = ? AND l.id = ? AND l.active = 0
    LIMIT 1
");
$verifyStmt->bind_param("ii", $chat_id, $safe_listing_id);
$verifyStmt->execute();
$verifiedListing = $verifyStmt->get_result()->fetch_assoc();
$verifyStmt->close();

if (!$verifiedListing) {
    http_response_code(400);
    echo json_encode(["message" => "This listing is not ready to review"]);
    exit;
}

$checkStmt = $conn->prepare("SELECT id FROM reviews WHERE reviewer_username = ? AND listing_id = ?");
$checkStmt->bind_param("si", $reviewer_username, $safe_listing_id);
$checkStmt->execute();
$alreadyReviewed = $checkStmt->get_result()->num_rows > 0;
$checkStmt->close();

if ($alreadyReviewed) {
    http_response_code(400);
    echo json_encode(["message" => "You have already reviewed this transaction."]);
    exit;
}

// Ensure purchase_history table exists
$conn->query("CREATE TABLE IF NOT EXISTS purchase_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    listing_id INT NOT NULL,
    buyer_username VARCHAR(100) NOT NULL,
    seller_username VARCHAR(100) NOT NULL,
    chat_id INT NOT NULL,
    review_id INT DEFAULT NULL,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_purchase (listing_id, buyer_username)
)");

// 5. Save the Review
$reviewStmt = $conn->prepare("INSERT INTO reviews (listing_id, reviewer_username, target_username, rating_score, review_text) VALUES (?, ?, ?, ?, ?)");
$reviewStmt->bind_param("issis", $safe_listing_id, $reviewer_username, $target_username, $rating, $note);

if ($reviewStmt->execute()) {
    $review_id = $conn->insert_id;
    $reviewStmt->close();

    $actual_buyer = $chatRow['buyer_username'];
    $actual_seller = $chatRow['seller_username'];

    // 6. Also record in purchase_history securely
    $phStmt = $conn->prepare(
        "INSERT INTO purchase_history (listing_id, buyer_username, seller_username, chat_id, review_id) 
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE review_id = VALUES(review_id), purchased_at = CURRENT_TIMESTAMP"
    );
    $phStmt->bind_param("issii", $safe_listing_id, $actual_buyer, $actual_seller, $chat_id, $review_id);
    $phStmt->execute();
    $phStmt->close();

    // Remove the completed listing from the chat UI visually
    $cleanupStmt = $conn->prepare("DELETE FROM chat_listings WHERE chat_id = ? AND listing_id = ?");
    $cleanupStmt->bind_param("ii", $chat_id, $safe_listing_id);
    $cleanupStmt->execute();

    if ($cleanupStmt->affected_rows > 0) {
        $nullifyStmt = $conn->prepare("UPDATE chats SET listing_id = 0 WHERE id = ? AND listing_id = ?");
        $nullifyStmt->bind_param("ii", $chat_id, $safe_listing_id);
        $nullifyStmt->execute();
        $nullifyStmt->close();
    }
    $cleanupStmt->close();



    http_response_code(200);
    echo json_encode(["message" => "Review submitted successfully"]);
} else {
    http_response_code(500);
    echo json_encode(["message" => "Database error saving review"]);
}
$conn->close();
?>
