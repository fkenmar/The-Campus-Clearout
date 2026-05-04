<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

require_once __DIR__ . '/db.php';

$conn->query("ALTER TABLE chats ADD COLUMN bundle_id INT DEFAULT NULL");

// 1. AUTHENTICATION
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

$tokenStmt = $conn->prepare("SELECT id, username FROM users u JOIN user_sessions s ON u.username = s.username WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenRes = $tokenStmt->get_result();

if ($tokenRes->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}
$user = $tokenRes->fetch_assoc();
$buyer_username = $user['username'];
$buyer_id = (int)$user['id'];
$tokenStmt->close();

// 2. GET BUNDLE & ANCHOR ITEM
$data = json_decode(file_get_contents("php://input"), true);
$bundle_id = (int)($data['bundle_id'] ?? 0);

$query = "
    SELECT b.username AS seller, b.title AS bundle_title, bi.listing_id, u.id AS seller_id
    FROM bundles b
    JOIN bundle_items bi ON b.id = bi.bundle_id
    JOIN users u ON b.username = u.username
    WHERE b.id = ?
    LIMIT 1
";
$stmt = $conn->prepare($query);
$stmt->bind_param("i", $bundle_id);
$stmt->execute();
$bundleData = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$bundleData) {
    http_response_code(404);
    echo json_encode(["message" => "Bundle or items not found"]);
    exit;
}

$seller_username = $bundleData['seller'];
$seller_id = (int)$bundleData['seller_id'];
$bundle_title = $bundleData['bundle_title'];
$anchor_id = (int)$bundleData['listing_id'];

if ($buyer_id === $seller_id) {
    http_response_code(400);
    echo json_encode(["message" => "You cannot message yourself about your own bundle"]);
    exit;
}

// 3. FIND OR CREATE CHAT (matched by bundle_id so this stays distinct from item-only chats)
$chatStmt = $conn->prepare("SELECT id FROM chats WHERE buyer_id = ? AND seller_id = ? AND bundle_id = ? LIMIT 1");
$chatStmt->bind_param("iii", $buyer_id, $seller_id, $bundle_id);
$chatStmt->execute();
$existingChat = $chatStmt->get_result()->fetch_assoc();
$chatStmt->close();

$isNew = false;
if ($existingChat) {
    $chat_id = (int)$existingChat['id'];
} else {
    // Upgrade any legacy chat whose anchor item happens to be in this bundle (bundle_id was never set)
    $legacyStmt = $conn->prepare("
        SELECT c.id
        FROM chats c
        JOIN bundle_items bi ON bi.listing_id = c.listing_id AND bi.bundle_id = ?
        WHERE c.buyer_id = ? AND c.seller_id = ? AND c.bundle_id IS NULL
        LIMIT 1
    ");
    $legacyStmt->bind_param("iii", $bundle_id, $buyer_id, $seller_id);
    $legacyStmt->execute();
    $legacyRow = $legacyStmt->get_result()->fetch_assoc();
    $legacyStmt->close();

    if ($legacyRow) {
        $chat_id = (int)$legacyRow['id'];
        $upd = $conn->prepare("UPDATE chats SET bundle_id = ? WHERE id = ?");
        $upd->bind_param("ii", $bundle_id, $chat_id);
        $upd->execute();
        $upd->close();
    } else {
        $ins = $conn->prepare("INSERT INTO chats (listing_id, bundle_id, buyer_username, buyer_id, seller_username, seller_id) VALUES (?, ?, ?, ?, ?, ?)");
        $ins->bind_param("iisisi", $anchor_id, $bundle_id, $buyer_username, $buyer_id, $seller_username, $seller_id);
        $ins->execute();
        $chat_id = $ins->insert_id;
        $ins->close();
        $isNew = true;
    }
}

// 4. ADD ANCHOR TO chat_listings (To fix the "Empty" Sidebar)
$clStmt = $conn->prepare("INSERT IGNORE INTO chat_listings (chat_id, listing_id) VALUES (?, ?)");
$clStmt->bind_param("ii", $chat_id, $anchor_id);
$clStmt->execute();
$clStmt->close();

// 5. SEND AUTO-MESSAGE
if ($isNew) {
    $msg = "Hey! I'm interested in your bundle: \"$bundle_title\". Is it still available?";
    $msgIns = $conn->prepare("INSERT INTO messages (chat_id, sender_username, sender_id, message) VALUES (?, ?, ?, ?)");
    $msgIns->bind_param("isis", $chat_id, $buyer_username, $buyer_id, $msg);
    $msgIns->execute();
    $msgIns->close();
}

// Keep bundle conversations compatible with listing-based transaction/review APIs.
$itemsStmt = $conn->prepare("
    SELECT listing_id
    FROM bundle_items
    WHERE bundle_id = ?
");

if (!$itemsStmt) {
    http_response_code(500);
    echo json_encode([
        "message" => "Failed to prepare bundle item sync",
        "db_error" => $conn->error
    ]);
    exit;
}

$itemsStmt->bind_param("i", $bundle_id);
$itemsStmt->execute();
$itemsResult = $itemsStmt->get_result();
$chatListingStmt = $conn->prepare("
    INSERT IGNORE INTO chat_listings (chat_id, listing_id)
    VALUES (?, ?)
");

if (!$chatListingStmt) {
    http_response_code(500);
    echo json_encode([
        "message" => "Failed to prepare chat listing sync",
        "db_error" => $conn->error
    ]);
    $itemsStmt->close();
    exit;
}

while ($itemRow = $itemsResult->fetch_assoc()) {
    $listingId = (int)$itemRow['listing_id'];
    $chatListingStmt->bind_param("ii", $chat_id, $listingId);
    $chatListingStmt->execute();
}

$chatListingStmt->close();
$itemsStmt->close();

echo json_encode(["chat_id" => $chat_id]);
$conn->close();
?>
