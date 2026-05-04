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

// Ensure expires_at column exists in sessions
$conn->query("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS expires_at DATETIME DEFAULT NULL");

// Validate token from Authorization header
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$user = $tokenResult->fetch_assoc();
$username = $user['username'];
$tokenStmt->close();

// Ensure listings table has description
$conn->query("ALTER TABLE listings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL");

// Fetch current user's active listings
$stmt = $conn->prepare("
    SELECT l.id, l.title, l.price, l.image, l.username, l.description, l.tags, u.profile_photo
    FROM listings l
    LEFT JOIN users u ON l.username = u.username
    WHERE l.active = 1 AND l.username = ?
    ORDER BY l.id DESC
");
$stmt->bind_param("s", $username);
$stmt->execute();
$result = $stmt->get_result();

$listings = [];
while ($row = $result->fetch_assoc()) {
    $listings[] = $row;
}

echo json_encode($listings);

$stmt->close();
$conn->close();
?>