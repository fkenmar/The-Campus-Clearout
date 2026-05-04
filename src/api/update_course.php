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
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["error" => "Invalid or expired token"]);
    exit;
}

$username = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();

// Process update request
$course_id = $_POST['course_id'] ?? null;
$title = trim($_POST['title'] ?? '');
$description = trim($_POST['description'] ?? '');
$materials = trim($_POST['materials'] ?? '');
$tags = trim($_POST['tags'] ?? '');

if (!$course_id || !$title || !$description || !$materials || !$tags) {
    http_response_code(400);
    echo json_encode(["error" => "All fields are required."]);
    exit;
}

// Update only if the current user is the prof of the course
$updateStmt = $conn->prepare("UPDATE courses SET title = ?, description = ?, materials = ?, tags = ? WHERE id = ? AND prof = ?");
$updateStmt->bind_param("ssssis", $title, $description, $materials, $tags, $course_id, $username);

if ($updateStmt->execute()) {
    if ($updateStmt->affected_rows > 0) {
        echo json_encode(["message" => "Course updated successfully"]);
    } else {
        http_response_code(403);
        echo json_encode(["error" => "Course not found, unchanged, or you do not have permission to edit it."]);
    }
} else {
    http_response_code(500);
    echo json_encode(["error" => "Failed to update course"]);
}

$updateStmt->close();
$conn->close();
?>