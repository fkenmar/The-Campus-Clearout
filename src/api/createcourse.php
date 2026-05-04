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

/* -----------------------------
   TOKEN CHECK
------------------------------ */

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
    echo json_encode(["error" => "Token prepare failed"]);
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

$userRow = $tokenResult->fetch_assoc();
$username = $userRow["username"];
$tokenStmt->close();

/* -----------------------------
   PROFESSOR CHECK
------------------------------ */

$profStmt = $conn->prepare("
    SELECT prof 
    FROM users 
    WHERE username = ?
");

$profStmt->bind_param("s", $username);
$profStmt->execute();
$profResult = $profStmt->get_result();

if ($profResult->num_rows === 0) {
    http_response_code(403);
    echo json_encode(["error" => "User not found"]);
    exit;
}

$profRow = $profResult->fetch_assoc();

if ((int)$profRow["prof"] !== 1) {
    http_response_code(403);
    echo json_encode([
        "error" => "You cannot create a course because you are not a registered professor"
    ]);
    exit;
}

$profStmt->close();

/* -----------------------------
   READ POST DATA
------------------------------ */

$title       = $_POST["title"] ?? "";
$description = $_POST["description"] ?? "";
$materials   = $_POST["materials"] ?? "";
$tags        = $_POST["tags"] ?? "";

if (!$title) {
    http_response_code(400);
    echo json_encode(["error" => "Course title is required"]);
    exit;
}

/* -----------------------------
   INSERT COURSE
------------------------------ */

$insertStmt = $conn->prepare("
    INSERT INTO courses (prof, title, description, materials, tags)
    VALUES (?, ?, ?, ?, ?)
");

if (!$insertStmt) {
    http_response_code(500);
    echo json_encode(["error" => "Insert prepare failed"]);
    exit;
}

$insertStmt->bind_param("sssss", $username, $title, $description, $materials, $tags);

if ($insertStmt->execute()) {
    echo json_encode([
        "success" => true,
        "message" => "Course created successfully",
        "course_id" => $insertStmt->insert_id
    ]);
} else {
    http_response_code(500);
    echo json_encode(["error" => "Database insert failed"]);
}

$insertStmt->close();
$conn->close();
?>
