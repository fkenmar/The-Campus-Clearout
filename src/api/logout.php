<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

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

$data = json_decode(file_get_contents("php://input"), true);
$token = $data["token"] ?? "";

if (!$token) {
    http_response_code(400);
    echo json_encode(["message" => "Token is required"]);
    exit;
}

// Look up who owns this token before deleting
$whoStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ?");
$whoStmt->bind_param("s", $token);
$whoStmt->execute();
$whoRow = $whoStmt->get_result()->fetch_assoc();
$whoStmt->close();

$stmt = $conn->prepare("DELETE FROM user_sessions WHERE token = ?");
$stmt->bind_param("s", $token);
$stmt->execute();

// Immediately mark user as offline
if ($whoRow) {
    $offlineStmt = $conn->prepare("UPDATE users SET last_seen = NULL WHERE username = ?");
    if ($offlineStmt) {
        $offlineStmt->bind_param("s", $whoRow['username']);
        $offlineStmt->execute();
        $offlineStmt->close();
    }
}

echo json_encode(["message" => "Logged out successfully"]);

$stmt->close();
$conn->close();
?>
