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

if (!isset($data["email"]) || !isset($data["username"])) {
    echo json_encode(["success" => false, "message" => "Email and username are required"]);
    exit();
}

$email = trim($data["email"]);
$username = trim($data["username"]);

if ($email === "" || $username === "") {
    echo json_encode(["success" => false, "message" => "Email and username are required"]);
    exit();
}

if (!preg_match("/@buffalo\.edu$/", $email)) {
    echo json_encode(["success" => false, "message" => "Email must be @buffalo.edu"]);
    exit();
}

// Verify that username and email match
$checkStmt = $conn->prepare("SELECT username FROM users WHERE username = ? AND email = ? LIMIT 1");
$checkStmt->bind_param("ss", $username, $email);
$checkStmt->execute();
$result = $checkStmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "Username and email do not match"]);
    $checkStmt->close();
    $conn->close();
    exit();
}
$checkStmt->close();

// Generate token and expiration
$token = bin2hex(random_bytes(32));
$expires = date("Y-m-d H:i:s", time() + 3600); // 1 hour

$updateStmt = $conn->prepare("
    UPDATE users
    SET reset_token = ?, reset_token_expires = ?
    WHERE username = ? AND email = ?
");
$updateStmt->bind_param("ssss", $token, $expires, $username, $email);
$updateStmt->execute();

if ($updateStmt->affected_rows === 0) {
    echo json_encode(["success" => false, "message" => "Could not create reset token"]);
    $updateStmt->close();
    $conn->close();
    exit();
}
$updateStmt->close();

// Link goes to React route, not PHP page
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$appRoot = $protocol . '://' . $_SERVER['HTTP_HOST'] . '/CSE442/2026-Spring/cse-442s/';
$resetLink = $appRoot . "#/reset-password?token=" . urlencode($token);

$subject = "Reset Your Password";
$message = "Hello $username,\n\n";
$message .= "Click the link below to reset your password:\n$resetLink\n\n";
$message .= "This link expires in 1 hour.\n\n";
$message .= "If you did not request this, you can ignore this email.";

$headers = "From: no-reply@yourdomain.com\r\n";
$headers .= "Reply-To: no-reply@yourdomain.com\r\n";

if (mail($email, $subject, $message, $headers)) {
    echo json_encode(["success" => true, "message" => "Password reset email sent"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to send email"]);
}

$conn->close();
?>