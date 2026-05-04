<?php
header("Content-Type: application/json");

require_once __DIR__ . '/db.php';

$headers = getallheaders();
$token = str_replace('Bearer ', '', $headers['Authorization'] ?? '');

$tokenStmt = $conn->prepare("
    SELECT u.id FROM user_sessions s
    JOIN users u ON s.username = u.username
    WHERE s.token = ?
");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$res = $tokenStmt->get_result();
$me_id = (int)$res->fetch_assoc()['id'];

$data = json_decode(file_get_contents("php://input"), true);
$chat_id = (int)$data['chat_id'];

$stmt = $conn->prepare("
    SELECT buyer_id, seller_id, buyer_pinned, seller_pinned
    FROM chats WHERE id = ?
");
$stmt->bind_param("i", $chat_id);
$stmt->execute();
$chat = $stmt->get_result()->fetch_assoc();

$isBuyer = ($chat['buyer_id'] == $me_id);
$col = $isBuyer ? "buyer_pinned" : "seller_pinned";
$newVal = $chat[$col] ? 0 : 1;

$conn->query("UPDATE chats SET $col = $newVal WHERE id = $chat_id");

echo json_encode(["pinned"=>$newVal]);
?>