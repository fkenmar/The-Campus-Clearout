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
if ($res->num_rows === 0) exit;

$me_id = (int)$res->fetch_assoc()['id'];

$data = json_decode(file_get_contents("php://input"), true);
$id = (int)$data['message_id'];

$stmt = $conn->prepare("
    DELETE FROM messages 
    WHERE id = ? AND sender_id = ?
");
$stmt->bind_param("ii", $id, $me_id);
$stmt->execute();

echo json_encode(["message"=>"deleted"]);
?>