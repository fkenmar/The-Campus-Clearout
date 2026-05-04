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
    echo json_encode(["message" => "Database connection failed"]);
    exit;
}

// Authenticate token
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

$username = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();

// Parse request body
$data = json_decode(file_get_contents("php://input"), true);
$course_id = $data["course_id"] ?? null;

if (!$course_id) {
    http_response_code(400);
    echo json_encode(["message" => "course_id is required"]);
    exit;
}

// Delete course if user is owner (checking the 'prof' column)
$deleteStmt = $conn->prepare("DELETE FROM courses WHERE id = ? AND prof = ?");
$deleteStmt->bind_param("is", $course_id, $username);

if ($deleteStmt->execute()) {
    if ($deleteStmt->affected_rows > 0) {
        echo json_encode(["message" => "Course deleted successfully"]);
    } else {
        http_response_code(403);
        echo json_encode(["message" => "Course not found or you do not have permission to delete it."]);
    }
} else {
    http_response_code(500);
    echo json_encode(["message" => "Failed to delete course"]);
}

$deleteStmt->close();
$conn->close();
?>