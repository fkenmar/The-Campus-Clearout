<?php
header("Content-Type: application/json");

require_once __DIR__ . '/db.php';

$headers = getallheaders();
$token = str_replace('Bearer ', '', $headers['Authorization'] ?? '');

$tokenStmt = $conn->prepare("
    SELECT u.id, u.username FROM user_sessions s
    JOIN users u ON s.username = u.username
    WHERE s.token = ?
");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$res = $tokenStmt->get_result();
$user = $res->fetch_assoc();

$me_id = (int)$user['id'];
$me_username = $user['username'];

$q = trim($_GET['query'] ?? "");
if (!$q) exit(json_encode([]));

$like = "%$q%";

$stmt = $conn->prepare("
    SELECT m.id, m.chat_id, m.sender_id, m.message, m.sent_at,
           c.buyer_id, c.seller_id,
           ub.username AS buyer_name,
           us.username AS seller_name,
           l.title
    FROM messages m
    JOIN chats c ON c.id = m.chat_id
    LEFT JOIN users ub ON ub.id = c.buyer_id
    LEFT JOIN users us ON us.id = c.seller_id
    LEFT JOIN listings l ON l.id = c.listing_id
    WHERE (c.buyer_id = ? OR c.seller_id = ?)
      AND m.message LIKE ?
    ORDER BY m.sent_at DESC
");

$stmt->bind_param("iis", $me_id, $me_id, $like);
$stmt->execute();
$res = $stmt->get_result();

$out = [];
while ($r = $res->fetch_assoc()) {

    $isBuyer = ($r['buyer_id'] == $me_id);

    $out[] = [
        "message_id" => (int)$r['id'],
        "chat_id" => (int)$r['chat_id'],
        "sender" => ($r['sender_id'] == $me_id) ? "me" : "them",
        "message" => $r['message'],
        "sent_at" => date("g:i A", strtotime($r['sent_at'])),
        "listing_title" => $r['title'],
        "contact" => $isBuyer ? $r['seller_name'] : $r['buyer_name']
    ];
}

echo json_encode($out);
?>