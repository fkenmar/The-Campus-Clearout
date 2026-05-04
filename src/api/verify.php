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

// Get JSON from React
$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data["email"]) || !isset($data["id"])) {
    echo json_encode(["success" => false, "message" => "Email and id are required"]);
    exit();
}

$email = trim($data["email"]);
$userId = (int) $data["id"];

// Only accept @buffalo.edu
if (!preg_match("/@buffalo\.edu$/", $email)) {
    echo json_encode(["success" => false, "message" => "Email must be @buffalo.edu"]);
    exit();
}

// Generate secure token
$token = bin2hex(random_bytes(32));

// Update email + token for the specific user just created
$stmt = $conn->prepare("
    UPDATE users
    SET email=?, verification_token=?, is_verified=0
    WHERE id=?
");

$stmt->bind_param("ssi", $email, $token, $userId);
$stmt->execute();

// ⭐ CHECK FOR SQL ERRORS FIRST
if ($stmt->errno) {

    // Duplicate email error (MySQL error code 1062)
    if ($stmt->errno === 1062) {
        echo json_encode([
            "success" => false,
            "message" => "This email is already linked to another account. Please make sure you are using the correct email."
        ]);
        exit();
    }

    // Other SQL errors
    echo json_encode([
        "success" => false,
        "message" => "Server error. Try again later.",
        "sql_error" => $stmt->error
    ]);
    exit();
}

// If no rows updated, id didn't match
if ($stmt->affected_rows === 0) {
    echo json_encode(["success" => false, "message" => "User not found"]);
    exit();
}

// Send email
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$base = $protocol . '://' . $_SERVER['HTTP_HOST'] . '/CSE442/2026-Spring/cse-442s';
$verificationLink = $base . "/api/confirm.php?token=" . $token;
$subject = "Verify Your Account";
$message = "Click this link to verify your email:\n$verificationLink";
$headers = "From: no-reply@yourdomain.com";

if (mail($email, $subject, $message, $headers)) {
    echo json_encode(["success" => true, "message" => "Verification email sent"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to send email"]);
}

$conn->close();
?>