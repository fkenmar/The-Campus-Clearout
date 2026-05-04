<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
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

// Keep these for transition safety if your schema may vary by environment
$conn->query("ALTER TABLE messages ADD COLUMN image_url VARCHAR(500) DEFAULT NULL");
$conn->query("ALTER TABLE chats ADD COLUMN buyer_typing_at DATETIME DEFAULT NULL");
$conn->query("ALTER TABLE chats ADD COLUMN seller_typing_at DATETIME DEFAULT NULL");
$conn->query("ALTER TABLE chat_listings ADD COLUMN buyer_removed TINYINT(1) DEFAULT 0");
$conn->query("ALTER TABLE chat_listings ADD COLUMN seller_removed TINYINT(1) DEFAULT 0");
$conn->query("ALTER TABLE messages ADD COLUMN is_system TINYINT(1) DEFAULT 0");
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
$me_id = (int)$userRow["id"];
$me = $userRow["username"]; // kept for display/review queries during transition
$tokenStmt->close();

// Validate chat_id
$chat_id = filter_input(INPUT_GET, 'chat_id', FILTER_VALIDATE_INT, ["options" => ["min_range" => 1]]);
if (!$chat_id) {
    http_response_code(400);
    echo json_encode(["message" => "Valid chat_id is required"]);
    exit;
}

// Verify the user is a participant in this chat
$chatStmt = $conn->prepare(
    "SELECT 
        c.id,
        c.buyer_id,
        c.seller_id,
        c.buyer_username,
        c.seller_username,
        c.listing_id,
        c.bundle_id
     FROM chats c
     WHERE c.id = ? AND (c.buyer_id = ? OR c.seller_id = ?)"
);

if (!$chatStmt) {
    http_response_code(500);
    echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
    exit;
}

$chatStmt->bind_param("iii", $chat_id, $me_id, $me_id);
$chatStmt->execute();
$chatRow = $chatStmt->get_result()->fetch_assoc();
$chatStmt->close();

if (!$chatRow) {
    http_response_code(403);
    echo json_encode(["message" => "Chat not found or access denied"]);
    exit;
}

$isBuyer = ((int)$chatRow['buyer_id'] === $me_id);

$contact_id = $isBuyer
    ? (int)$chatRow['seller_id']
    : (int)$chatRow['buyer_id'];

$contact_username = $isBuyer
    ? $chatRow['seller_username']
    : $chatRow['buyer_username'];

// Mark messages as read for the current user
$readCol = $isBuyer ? 'buyer_last_read' : 'seller_last_read';
if (!in_array($readCol, ['buyer_last_read', 'seller_last_read'], true)) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid read column"]);
    exit;
}

$readStmt = $conn->prepare("UPDATE chats SET $readCol = NOW() WHERE id = ?");
if ($readStmt) {
    $readStmt->bind_param("i", $chat_id);
    $readStmt->execute();
    $readStmt->close();
}

// Check if contact was active recently
$onlineStmt = $conn->prepare(
    "SELECT id
     FROM users
     WHERE id = ? AND last_seen > DATE_SUB(NOW(), INTERVAL 30 SECOND)"
);
if ($onlineStmt) {
    $onlineStmt->bind_param("i", $contact_id);
    $onlineStmt->execute();
    $isOnline = $onlineStmt->get_result()->num_rows > 0;
    $onlineStmt->close();
} else {
    $isOnline = false;
}

// Check if contact is currently typing
$typingCol = $isBuyer ? 'seller_typing_at' : 'buyer_typing_at';
if (!in_array($typingCol, ['buyer_typing_at', 'seller_typing_at'], true)) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid typing column"]);
    exit;
}

$typingStmt = $conn->prepare(
    "SELECT $typingCol
     FROM chats
     WHERE id = ? AND $typingCol > DATE_SUB(NOW(), INTERVAL 4 SECOND)"
);
if ($typingStmt) {
    $typingStmt->bind_param("i", $chat_id);
    $typingStmt->execute();
    $isTyping = $typingStmt->get_result()->num_rows > 0;
    $typingStmt->close();
} else {
    $isTyping = false;
}

// Fetch avatar
$contactAvatar = null;
$avatarStmt = $conn->prepare("SELECT profile_photo FROM users WHERE id = ?");
if ($avatarStmt) {
    $avatarStmt->bind_param("i", $contact_id);
    $avatarStmt->execute();
    $avatarRow = $avatarStmt->get_result()->fetch_assoc();
    $contactAvatar = $avatarRow['profile_photo'] ?? null;
    $avatarStmt->close();
}

$listings = [];

$reviewedListingIds = [];
$reviewCheckStmt = $conn->prepare("SELECT listing_id FROM reviews WHERE reviewer_username = ?");
if ($reviewCheckStmt) {
    $reviewCheckStmt->bind_param("s", $me);
    $reviewCheckStmt->execute();
    $reviewCheckResult = $reviewCheckStmt->get_result();
    while ($rr = $reviewCheckResult->fetch_assoc()) {
        $reviewedListingIds[] = (int)$rr['listing_id'];
    }
    $reviewCheckStmt->close();
}

if (!empty($chatRow['bundle_id'])) {
    // Bundle conversations: source items from bundle_items so we always get the full bundle,
    // independent of how chat_listings happens to be populated.
    $bid = (int)$chatRow['bundle_id'];
    $removedCol = $isBuyer ? "cl.buyer_removed" : "cl.seller_removed";

    $listingStmt = $conn->prepare("
        SELECT
            l.id,
            l.title,
            l.price,
            l.image,
            l.description,
            l.tags,
            l.username,
            l.user_id,
            l.active,
            u.profile_photo,
            COALESCE($removedCol, 0) AS buyer_removed
        FROM bundle_items bi
        JOIN listings l ON l.id = bi.listing_id
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN chat_listings cl ON cl.chat_id = ? AND cl.listing_id = bi.listing_id
        WHERE bi.bundle_id = ?
        ORDER BY bi.id ASC
    ");

    if (!$listingStmt) {
        http_response_code(500);
        echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
        $conn->close();
        exit;
    }

    $listingStmt->bind_param("ii", $chat_id, $bid);
    $listingStmt->execute();
    $listingRows = $listingStmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $listingStmt->close();

    // Keep chat_listings in sync so transaction/review APIs (which use chat_id+listing_id) keep working.
    if (!empty($listingRows)) {
        $syncStmt = $conn->prepare("INSERT IGNORE INTO chat_listings (chat_id, listing_id) VALUES (?, ?)");
        if ($syncStmt) {
            foreach ($listingRows as $rowToSync) {
                $listingIdToSync = (int)$rowToSync['id'];
                $syncStmt->bind_param("ii", $chat_id, $listingIdToSync);
                $syncStmt->execute();
            }
            $syncStmt->close();
        }
    }

    $listings = array_map(function ($l) use ($reviewedListingIds) {
        return [
            "id" => (int)$l['id'],
            "title" => $l['title'],
            "price" => $l['price'],
            "image" => $l['image'],
            "description" => $l['description'],
            "tag" => $l['tags'] ?? "GENERAL",
            "active" => (int)$l['active'],
            "username" => $l['username'],
            "seller_id" => isset($l['user_id']) ? (int)$l['user_id'] : null,
            "profile_photo" => $l['profile_photo'],
            "removed_by_buyer" => (bool)($l['buyer_removed'] ?? false),
            "reviewed" => in_array((int)$l['id'], $reviewedListingIds, true),
            "is_bundle_item" => true
        ];
    }, $listingRows);
} else {
    // Regular listing conversation
    $removedFilter = $isBuyer ? "AND cl.buyer_removed = 0" : "AND cl.seller_removed = 0";

    $listingStmt = $conn->prepare(
        "SELECT
            l.id,
            l.title,
            l.price,
            l.image,
            l.description,
            l.tags,
            l.username,
            l.user_id,
            l.active,
            u.profile_photo,
            cl.buyer_removed
         FROM chat_listings cl
         JOIN listings l ON l.id = cl.listing_id
         LEFT JOIN users u ON l.user_id = u.id
         WHERE cl.chat_id = ? $removedFilter
         ORDER BY cl.added_at DESC"
    );

    if (!$listingStmt) {
        http_response_code(500);
        echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
        $conn->close();
        exit;
    }

    $listingStmt->bind_param("i", $chat_id);
    $listingStmt->execute();
    $listingRows = $listingStmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $listingStmt->close();

    // Fallback: if chat_listings is empty, use the original listing_id from chats
    if (empty($listingRows) && $chatRow['listing_id']) {
        $fallbackStmt = $conn->prepare(
            "SELECT
                l.id,
                l.title,
                l.price,
                l.image,
                l.description,
                l.tags,
                l.username,
                l.user_id,
                l.active,
                u.profile_photo
             FROM listings l
             LEFT JOIN users u ON l.user_id = u.id
             WHERE l.id = ?"
        );
        $fallbackStmt->bind_param("i", $chatRow['listing_id']);
        $fallbackStmt->execute();
        $listingRows = $fallbackStmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $fallbackStmt->close();
    }

    $listings = array_map(function ($l) use ($reviewedListingIds) {
        return [
            "id" => (int)$l['id'],
            "title" => $l['title'],
            "price" => $l['price'],
            "image" => $l['image'],
            "description" => $l['description'],
            "tag" => $l['tags'] ?? "GENERAL",
            "active" => (int)$l['active'],
            "username" => $l['username'],
            "seller_id" => isset($l['user_id']) ? (int)$l['user_id'] : null,
            "profile_photo" => $l['profile_photo'],
            "removed_by_buyer" => (bool)($l['buyer_removed'] ?? false),
            "reviewed" => in_array((int)$l['id'], $reviewedListingIds, true),
            "is_bundle" => false
        ];
    }, $listingRows);
}

// Get messages
$msgStmt = $conn->prepare(
    "SELECT id, sender_id, sender_username, message, image_url, sent_at, is_system
     FROM messages
     WHERE chat_id = ?
     ORDER BY sent_at ASC"
);

if (!$msgStmt) {
    http_response_code(500);
    echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
    $conn->close();
    exit;
}

$msgStmt->bind_param("i", $chat_id);
$msgStmt->execute();
$msgRows = $msgStmt->get_result()->fetch_all(MYSQLI_ASSOC);
$msgStmt->close();

$messages = array_map(function ($m) use ($me_id) {
    return [
        "id" => (int)$m['id'],
        "sender" => ((int)$m['sender_id'] === $me_id) ? "me" : "them",
        "text" => $m['message'],
        "image_url" => $m['image_url'],
        "time" => date("g:i A", strtotime($m['sent_at'])),
        "date" => date("Y-m-d", strtotime($m['sent_at'])),
        "is_system" => (bool)($m['is_system'] ?? false)
    ];
}, $msgRows);

echo json_encode([
    "id" => (int)$chat_id,
    "contact" => [
        "name" => $contact_username,
        "initials" => strtoupper(substr($contact_username, 0, 1)),
        "avatar" => $contactAvatar,
        "online" => $isOnline,
        "typing" => $isTyping,
        "seller" => $chatRow['seller_username'],
        "seller_id" => (int)$chatRow['seller_id']
    ],
    "listings" => $listings,
    "messages" => $messages
]);

$conn->close();
?>
