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
    exit;
}

// 1. Authenticate
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    exit;
}
$seller_username = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();

// 2. Parse JSON
$data = json_decode(file_get_contents("php://input"), true);
$listing_id = $data['listing_id'] ?? null;

if (!$listing_id) {
    http_response_code(400);
    exit;
}

// 3. Relist the item (Set active back to 1)
$updateStmt = $conn->prepare("UPDATE listings SET active = 1 WHERE id = ? AND username = ?");
$updateStmt->bind_param("is", $listing_id, $seller_username);
$updateStmt->execute();
$updateStmt->close();

http_response_code(200);
echo json_encode(["message" => "Item relisted successfully"]);
$conn->close();
?>