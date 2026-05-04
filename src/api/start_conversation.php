<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

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

$conn->query("ALTER TABLE chats ADD COLUMN bundle_id INT DEFAULT NULL");

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
    "SELECT u.id, u.username
     FROM user_sessions s
     JOIN users u ON u.username = s.username
     WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > NOW())"
);

if (!$tokenStmt) {
    http_response_code(500);
    echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
    exit;
}

$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    $tokenStmt->close();
    exit;
}

$userRow = $tokenResult->fetch_assoc();
$buyer_id = (int)$userRow["id"];
$buyer_username = $userRow["username"];
$tokenStmt->close();

// Parse and validate input
$data = json_decode(file_get_contents("php://input"), true);
$listing_id = isset($data['listing_id'])
    ? filter_var($data['listing_id'], FILTER_VALIDATE_INT, ["options" => ["min_range" => 1]])
    : false;

if (!$listing_id) {
    http_response_code(400);
    echo json_encode(["message" => "Valid listing_id is required"]);
    exit;
}

// Look up the listing and its owner
$listingStmt = $conn->prepare(
    "SELECT user_id, username, title
     FROM listings
     WHERE id = ?"
);

if (!$listingStmt) {
    http_response_code(500);
    echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
    exit;
}

$listingStmt->bind_param("i", $listing_id);
$listingStmt->execute();
$listingRow = $listingStmt->get_result()->fetch_assoc();
$listingStmt->close();

if (!$listingRow) {
    http_response_code(404);
    echo json_encode(["message" => "Listing not found"]);
    exit;
}

$seller_id = isset($listingRow['user_id']) ? (int)$listingRow['user_id'] : 0;
$seller_username = $listingRow['username'];
$listing_title = $listingRow['title'];

if ($seller_id < 1) {
    http_response_code(500);
    echo json_encode(["message" => "Listing owner is missing a valid user_id"]);
    exit;
}

// Cannot message yourself
if ($buyer_id === $seller_id) {
    http_response_code(400);
    echo json_encode(["message" => "You cannot message yourself about your own listing"]);
    exit;
}

// Find existing item chat between this buyer and seller (exclude bundle chats)
$existingStmt = $conn->prepare(
    "SELECT id
     FROM chats
     WHERE buyer_id = ? AND seller_id = ? AND bundle_id IS NULL
     LIMIT 1"
);

if (!$existingStmt) {
    http_response_code(500);
    echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
    exit;
}

$existingStmt->bind_param("ii", $buyer_id, $seller_id);
$existingStmt->execute();
$existingRow = $existingStmt->get_result()->fetch_assoc();
$existingStmt->close();

if ($existingRow) {
    $chat_id = (int)$existingRow['id'];
} else {
    // Create new chat
    // Dual-write usernames too for safety during transition
    $insertStmt = $conn->prepare(
        "INSERT INTO chats (
            listing_id,
            buyer_username,
            buyer_id,
            seller_username,
            seller_id
        ) VALUES (?, ?, ?, ?, ?)"
    );

    if (!$insertStmt) {
        http_response_code(500);
        echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
        exit;
    }

    $insertStmt->bind_param(
        "isisi",
        $listing_id,
        $buyer_username,
        $buyer_id,
        $seller_username,
        $seller_id
    );

    if (!$insertStmt->execute()) {
        http_response_code(500);
        echo json_encode(["message" => "Failed to create conversation"]);
        $insertStmt->close();
        $conn->close();
        exit;
    }

    $chat_id = $insertStmt->insert_id;
    $insertStmt->close();
}

// Add this listing to the chat (ignore if already there)
$clStmt = $conn->prepare(
    "INSERT IGNORE INTO chat_listings (chat_id, listing_id) VALUES (?, ?)"
);

if (!$clStmt) {
    http_response_code(500);
    echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
    $conn->close();
    exit;
}

$clStmt->bind_param("ii", $chat_id, $listing_id);
$clStmt->execute();
$listingWasNew = $clStmt->affected_rows > 0;
$clStmt->close();

// Send an auto-message from the buyer when a listing is newly added to this chat
if ($listingWasNew) {
    $autoMsg = "Hey! I'm interested in \"$listing_title\". Is it still available?";

    // Dual-write sender_username too for transition safety
    $msgStmt = $conn->prepare(
        "INSERT INTO messages (chat_id, sender_username, sender_id, message)
         VALUES (?, ?, ?, ?)"
    );

    if (!$msgStmt) {
        http_response_code(500);
        echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
        $conn->close();
        exit;
    }

    $msgStmt->bind_param("isis", $chat_id, $buyer_username, $buyer_id, $autoMsg);
    $msgStmt->execute();
    $msgStmt->close();
}

echo json_encode(["chat_id" => $chat_id]);

$conn->close();
?>