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

// Auth (UPDATED)
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
    exit;
}

$userRow = $tokenResult->fetch_assoc();
$me_id = (int)$userRow["id"];
$me_username = $userRow["username"];
$tokenStmt->close();

// Fetch chats (UPDATED → IDs)
$stmt = $conn->prepare("
    SELECT
        c.id,
        c.listing_id,
        c.buyer_id,
        c.seller_id,
        c.buyer_username,
        c.seller_username,
        c.buyer_last_read,
        c.seller_last_read,
        c.buyer_pinned,
        c.seller_pinned,
        l.title AS listing_title,
        m.message AS latest_message,
        m.sent_at AS last_updated
    FROM chats c
    LEFT JOIN listings l ON l.id = c.listing_id
    LEFT JOIN messages m ON m.id = (
        SELECT id FROM messages WHERE chat_id = c.id ORDER BY sent_at DESC LIMIT 1
    )
    WHERE c.buyer_id = ? OR c.seller_id = ?
    ORDER BY
        CASE WHEN c.buyer_id = ? THEN c.buyer_pinned ELSE c.seller_pinned END DESC,
        last_updated DESC
");

$stmt->bind_param("iii", $me_id, $me_id, $me_id);
$stmt->execute();
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

$conversations = [];

foreach ($rows as $row) {

    $isBuyer = ((int)$row['buyer_id'] === $me_id);

    $contact_id = $isBuyer
        ? (int)$row['seller_id']
        : (int)$row['buyer_id'];

    $contact_username = $isBuyer
        ? $row['seller_username']
        : $row['buyer_username'];

    // Online status (UPDATED → ID)
    $onlineStmt = $conn->prepare(
        "SELECT id FROM users WHERE id = ? AND last_seen > DATE_SUB(NOW(), INTERVAL 30 SECOND)"
    );
    $onlineStmt->bind_param("i", $contact_id);
    $onlineStmt->execute();
    $isOnline = $onlineStmt->get_result()->num_rows > 0;
    $onlineStmt->close();

    // Avatar (UPDATED → ID)
    $contactAvatar = null;
    $avatarStmt = $conn->prepare("SELECT profile_photo FROM users WHERE id = ?");
    if ($avatarStmt) {
        $avatarStmt->bind_param("i", $contact_id);
        $avatarStmt->execute();
        $avatarRow = $avatarStmt->get_result()->fetch_assoc();
        $contactAvatar = $avatarRow['profile_photo'] ?? null;
        $avatarStmt->close();
    }

    // Read logic (UPDATED → ID)
    $last_read = $isBuyer
        ? $row['buyer_last_read']
        : $row['seller_last_read'];

    // Unread count (UPDATED → sender_id)
    if ($last_read) {
        $unreadStmt = $conn->prepare(
            "SELECT COUNT(*) AS cnt 
             FROM messages 
             WHERE chat_id = ? AND sender_id != ? AND sent_at > ?"
        );
        $unreadStmt->bind_param("iis", $row['id'], $me_id, $last_read);
    } else {
        $unreadStmt = $conn->prepare(
            "SELECT COUNT(*) AS cnt 
             FROM messages 
             WHERE chat_id = ? AND sender_id != ?"
        );
        $unreadStmt->bind_param("ii", $row['id'], $me_id);
    }

    $unreadStmt->execute();
    $unread_count = (int)$unreadStmt->get_result()->fetch_assoc()['cnt'];
    $unreadStmt->close();

    $lastUpdated = $row['last_updated'] ?? "";

    // Pin logic (UPDATED → ID)
    $is_pinned = $isBuyer
        ? (bool)$row['buyer_pinned']
        : (bool)$row['seller_pinned'];

    $conversations[] = [
        "id" => (int)$row['id'],
        "contact" => [
            "name" => $contact_username,
            "initials" => strtoupper(substr($contact_username, 0, 1)),
            "avatar" => $contactAvatar,
            "online" => $isOnline,
            "seller_id" => (int)$row['seller_id']
        ],
        "latestMessage" => $row['latest_message'] ?? "",
        "lastUpdated" => $lastUpdated,
        "unread_count" => $unread_count,
        "pinned" => $is_pinned
    ];
}

echo json_encode($conversations);

$conn->close();
?>