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
    echo json_encode(["message" => "DB error"]);
    exit;
}

// Ensure typing columns exist
$conn->query("ALTER TABLE chats ADD COLUMN buyer_typing_at DATETIME DEFAULT NULL");
$conn->query("ALTER TABLE chats ADD COLUMN seller_typing_at DATETIME DEFAULT NULL");

$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare(
    "SELECT u.id FROM user_sessions s
     JOIN users u ON s.username = u.username
     WHERE s.token = ? AND (expires_at IS NULL OR expires_at > NOW())"
);
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$row = $tokenStmt->get_result()->fetch_assoc();
$tokenStmt->close();

if (!$row) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$me_id = (int)$row["id"];

$body = json_decode(file_get_contents("php://input"), true);
$chat_id = (int)($body["chat_id"] ?? 0);
if (!$chat_id) {
    http_response_code(400);
    echo json_encode(["message" => "chat_id required"]);
    exit;
}

$chatStmt = $conn->prepare(
    "SELECT buyer_id, seller_id FROM chats WHERE id = ? AND (buyer_id = ? OR seller_id = ?)"
);
$chatStmt->bind_param("iii", $chat_id, $me_id, $me_id);
$chatStmt->execute();
$chatRow = $chatStmt->get_result()->fetch_assoc();
$chatStmt->close();

if (!$chatRow) {
    http_response_code(403);
    echo json_encode(["message" => "Access denied"]);
    exit;
}

$col = ($chatRow['buyer_id'] == $me_id) ? 'buyer_typing_at' : 'seller_typing_at';
if (!in_array($col, ['buyer_typing_at', 'seller_typing_at'], true)) { http_response_code(400); exit; }
$stmt = $conn->prepare("UPDATE chats SET $col = NOW() WHERE id = ?");
$stmt->bind_param("i", $chat_id);
$stmt->execute();
$stmt->close();

$conn->close();
http_response_code(200);
echo json_encode(["ok" => true]);
?>
