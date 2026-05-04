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

// Ensure tables exist
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
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}
$current_username = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();

// 2. Parse incoming JSON
$data = json_decode(file_get_contents("php://input"), true);
$chat_id = $data['chat_id'] ?? null;
$listing_ids = $data['listing_ids'] ?? [];
$rating = (int)($data['rating'] ?? 0);
$note = $data['note'] ?? '';

if (!$chat_id || empty($listing_ids) || $rating < 1 || $rating > 5) {
    http_response_code(400);
    echo json_encode(["message" => "Missing required fields (chat_id, listing_ids, rating)"]);
    exit;
}

// 3. Verify chat exists and determine roles
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

// Determine if current user is buyer or seller
$isBuyer = ($chatRow['buyer_username'] === $current_username);
$isSeller = ($chatRow['seller_username'] === $current_username);

if (!$isBuyer && !$isSeller) {
    http_response_code(403);
    echo json_encode(["message" => "You are not a participant in this chat"]);
    exit;
}

$buyer_username = $chatRow['buyer_username'];
$seller_username = $chatRow['seller_username'];

// The person being reviewed is the OTHER party
$target_username = $isBuyer ? $seller_username : $buyer_username;

// 4. Begin transaction
$conn->begin_transaction();

try {
    $completed_titles = [];
    $both_completed_titles = [];

    foreach ($listing_ids as $listing_id) {
        $lid = (int)$listing_id;

        // Verify the listing belongs to this chat and is sold (active = 0)
        $verifyStmt = $conn->prepare(
            "SELECT l.id, l.title, l.active FROM listings l
             JOIN chat_listings cl ON l.id = cl.listing_id
             WHERE cl.chat_id = ? AND l.id = ? AND l.active = 0"
        );
        $verifyStmt->bind_param("ii", $chat_id, $lid);
        $verifyStmt->execute();
        $verifyRow = $verifyStmt->get_result()->fetch_assoc();
        $verifyStmt->close();

        if (!$verifyRow) {
            continue;
        }

        // Check if already reviewed by this user
        $checkStmt = $conn->prepare("SELECT id FROM reviews WHERE reviewer_username = ? AND listing_id = ?");
        $checkStmt->bind_param("si", $current_username, $lid);
        $checkStmt->execute();
        $alreadyReviewed = $checkStmt->get_result()->num_rows > 0;
        $checkStmt->close();

        if ($alreadyReviewed) {
            continue;
        }

        // Insert review (current user reviews the other party)
        $reviewStmt = $conn->prepare(
            "INSERT INTO reviews (listing_id, reviewer_username, target_username, rating_score, review_text) VALUES (?, ?, ?, ?, ?)"
        );
        $reviewStmt->bind_param("issis", $lid, $current_username, $target_username, $rating, $note);
        $reviewStmt->execute();
        $review_id = $conn->insert_id;
        $reviewStmt->close();

        $completed_titles[] = $verifyRow['title'];

        // The Buyer's review submission is ALWAYS the final handshake because the 
        // seller must set active=0 before the buyer can even submit a review.
        // Therefore, we can unconditionally instantiate the purchase_history record here!
        $phStmt = $conn->prepare(
            "INSERT INTO purchase_history (listing_id, buyer_username, seller_username, chat_id, review_id) 
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE review_id = VALUES(review_id), purchased_at = CURRENT_TIMESTAMP"
        );
        $phStmt->bind_param("issii", $lid, $buyer_username, $seller_username, $chat_id, $review_id);
        $phStmt->execute();
        $phStmt->close();

        // Remove the completed listing from the chat UI
        $cleanupStmt = $conn->prepare("DELETE FROM chat_listings WHERE chat_id = ? AND listing_id = ?");
        $cleanupStmt->bind_param("ii", $chat_id, $lid);
        $cleanupStmt->execute();

        if ($cleanupStmt->affected_rows > 0) {
            $nullifyStmt = $conn->prepare("UPDATE chats SET listing_id = 0 WHERE id = ? AND listing_id = ?");
            $nullifyStmt->bind_param("ii", $chat_id, $lid);
            $nullifyStmt->execute();
            $nullifyStmt->close();
        }
        $cleanupStmt->close();

        $both_completed_titles[] = $verifyRow['title'];
    }

    if (empty($completed_titles)) {
        $conn->rollback();
        http_response_code(400);
        echo json_encode(["message" => "No eligible items to complete. They may have already been reviewed."]);
        exit;
    }

    // 5. Post system messages
    $role = $isBuyer ? "buyer" : "seller";

    // Notify that this user completed their review
    if (count($completed_titles) === 1) {
        $sysText = "System: {$current_username} ({$role}) completed their review for \"{$completed_titles[0]}\".";
    } else {
        $itemList = implode(", ", array_map(function($t) { return "\"$t\""; }, $completed_titles));
        $sysText = "System: {$current_username} ({$role}) completed their review for {$itemList}.";
    }

    $sysMsgStmt = $conn->prepare("INSERT INTO messages (chat_id, sender_username, message, is_system) VALUES (?, ?, ?, 1)");
    $sysMsgStmt->bind_param("iss", $chat_id, $current_username, $sysText);
    $sysMsgStmt->execute();
    $sysMsgStmt->close();

    // If both completed for some items, post an additional message
    if (!empty($both_completed_titles)) {
        if (count($both_completed_titles) === 1) {
            $bothText = "System: ✅ Both parties have completed the transaction for \"{$both_completed_titles[0]}\". Purchase recorded!";
        } else {
            $bothList = implode(", ", array_map(function($t) { return "\"$t\""; }, $both_completed_titles));
            $bothText = "System: ✅ Both parties have completed the transaction for {$bothList}. Purchases recorded!";
        }

        $bothMsgStmt = $conn->prepare("INSERT INTO messages (chat_id, sender_username, message, is_system) VALUES (?, ?, ?, 1)");
        $bothMsgStmt->bind_param("iss", $chat_id, $current_username, $bothText);
        $bothMsgStmt->execute();
        $bothMsgStmt->close();
    }

    $conn->commit();
    http_response_code(200);
    echo json_encode([
        "message" => "Transaction completed successfully",
        "completed_count" => count($completed_titles),
        "both_completed_count" => count($both_completed_titles)
    ]);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(["message" => "Server error: " . $e->getMessage()]);
}

$conn->close();
?>
