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

if (!isset($conn) || $conn->connect_error) {
    http_response_code(500);
    echo json_encode(["error" => "Database connection failed"]);
    exit;
}

$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["error" => "No token provided"]);
    exit;
}

$tokenStmt = $conn->prepare("
    SELECT username
    FROM user_sessions
    WHERE token = ?
    AND (expires_at IS NULL OR expires_at > NOW())
");

if (!$tokenStmt) {
    http_response_code(500);
    echo json_encode(["error" => "Server error"]);
    exit;
}

$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["error" => "Invalid or expired token"]);
    exit;
}

$tokenStmt->close();

$result = $conn->query("SELECT id, prof, title, description, materials, tags FROM courses ORDER BY id DESC");

if (!$result) {
    http_response_code(500);
    echo json_encode(["error" => "Query failed"]);
    exit;
}

$courses = [];
while ($row = $result->fetch_assoc()) {
    $courses[] = $row;
}

echo json_encode([
    "success" => true,
    "count" => count($courses),
    "data" => $courses
]);

$conn->close();
?>
