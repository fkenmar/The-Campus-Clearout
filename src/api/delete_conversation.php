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

$headers = getallheaders();
$auth  = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

$tokenStmt = $conn->prepare("
    SELECT u.id 
    FROM user_sessions s
    JOIN users u ON s.username = u.username
    WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > NOW())
");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$res = $tokenStmt->get_result();
if ($res->num_rows === 0) exit(json_encode(["message"=>"Unauthorized"]));
$me_id = (int)$res->fetch_assoc()['id'];

$body = json_decode(file_get_contents("php://input"), true);
$chat_id = (int)($body['chat_id'] ?? 0);

$check = $conn->prepare("
    SELECT id FROM chats 
    WHERE id = ? AND (buyer_id = ? OR seller_id = ?)
");
$check->bind_param("iii", $chat_id, $me_id, $me_id);
$check->execute();

if (!$check->get_result()->fetch_assoc()) {
    http_response_code(403);
    echo json_encode(["message"=>"Access denied"]);
    exit;
}

$conn->query("DELETE FROM messages WHERE chat_id = $chat_id");
$conn->query("DELETE FROM chat_listings WHERE chat_id = $chat_id");
$conn->query("DELETE FROM chats WHERE id = $chat_id");

echo json_encode(["message"=>"Conversation deleted"]);
?>