<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    echo json_encode(["success" => false, "message" => "Database connection failed"]);
    exit();
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    echo json_encode(["success" => false, "message" => "Invalid request"]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

if (
    !isset($data["token"]) ||
    !isset($data["password"]) ||
    !isset($data["confirmPassword"])
) {
    echo json_encode(["success" => false, "message" => "Token and passwords are required"]);
    exit();
}

$token = trim($data["token"]);
$password = $data["password"];
$confirmPassword = $data["confirmPassword"];

if ($token === "" || $password === "" || $confirmPassword === "") {
    echo json_encode(["success" => false, "message" => "Token and passwords are required"]);
    exit();
}

if ($password !== $confirmPassword) {
    echo json_encode(["success" => false, "message" => "Passwords do not match"]);
    exit();
}

if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).{8,}$/', $password)) {
    echo json_encode(["success" => false, "message" => "Password does not meet requirements"]);
    exit();
}

// Check valid token
$stmt = $conn->prepare("
    SELECT username
    FROM users
    WHERE reset_token = ? AND reset_token_expires > NOW()
    LIMIT 1
");
$stmt->bind_param("s", $token);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "Invalid or expired token"]);
    $stmt->close();
    $conn->close();
    exit();
}

$row = $result->fetch_assoc();
$username = $row["username"];
$stmt->close();

// Hash new password
$hashedPassword = password_hash($password, PASSWORD_DEFAULT);

// Update password and clear reset token
$updateStmt = $conn->prepare("
    UPDATE users
    SET password = ?, reset_token = NULL, reset_token_expires = NULL
    WHERE username = ?
");
$updateStmt->bind_param("ss", $hashedPassword, $username);
$updateStmt->execute();

if ($updateStmt->affected_rows === 0) {
    echo json_encode(["success" => false, "message" => "Password reset failed"]);
    $updateStmt->close();
    $conn->close();
    exit();
}

echo json_encode(["success" => true, "message" => "Password reset successful"]);

$updateStmt->close();
$conn->close();
?>