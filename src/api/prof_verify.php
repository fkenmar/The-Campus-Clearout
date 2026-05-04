<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    echo json_encode(["success" => false, "message" => "Database connection failed"]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    echo json_encode(["success" => false, "message" => "Invalid request"]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data["username"])) {
    echo json_encode(["success" => false, "message" => "Username is required"]);
    exit();
}

$username = trim($data["username"]);

if ($username === "") {
    echo json_encode(["success" => false, "message" => "Username cannot be empty"]);
    exit();
}

// Find professor email from Prof_Verify
$profStmt = $conn->prepare("SELECT email FROM Prof_Verify WHERE name = ? LIMIT 1");
if (!$profStmt) {
    echo json_encode(["success" => false, "message" => "Failed to prepare Prof_Verify query", "sql_error" => $conn->error]);
    exit();
}

$profStmt->bind_param("s", $username);
$profStmt->execute();
$profStmt->store_result();

if ($profStmt->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "Professor not found in Prof_Verify"]);
    $profStmt->close();
    $conn->close();
    exit();
}

$profStmt->bind_result($email);
$profStmt->fetch();
$profStmt->close();

$email = trim($email);

if ($email === "") {
    echo json_encode(["success" => false, "message" => "Professor email is empty in Prof_Verify"]);
    $conn->close();
    exit();
}

if (!preg_match("/@buffalo\.edu$/", $email)) {
    echo json_encode(["success" => false, "message" => "Professor email in Prof_Verify must be @buffalo.edu"]);
    $conn->close();
    exit();
}

$token = bin2hex(random_bytes(32));

// Update existing user
$stmt = $conn->prepare("
    UPDATE users
    SET email = ?, verification_token = ?, is_verified = 0, prof = 1
    WHERE username = ?
");

if (!$stmt) {
    echo json_encode(["success" => false, "message" => "Failed to prepare users update", "sql_error" => $conn->error]);
    $conn->close();
    exit();
}

$stmt->bind_param("sss", $email, $token, $username);
$stmt->execute();

if ($stmt->affected_rows === 0) {
    echo json_encode(["success" => false, "message" => "User not found in users table"]);
    $stmt->close();
    $conn->close();
    exit();
}

$stmt->close();

$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$base = $protocol . '://' . $_SERVER['HTTP_HOST'] . '/CSE442/2026-Spring/cse-442s';
$verificationLink = $base . "/api/confirm.php?token=" . $token;
$subject = "Verify Your Professor Account";
$message = "Click this link to verify your email:\n$verificationLink";
$headers = "From: no-reply@yourdomain.com";

if (mail($email, $subject, $message, $headers)) {
    echo json_encode([
        "success" => true,
        "message" => "Professor verification email sent",
        "email_used" => $email
    ]);
} else {
    echo json_encode([
        "success" => false,
        "message" => "Failed to send email"
    ]);
}

$conn->close();
?>