<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed"
    ]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode([
        "success" => false,
        "message" => "Invalid request method"
    ]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

$username = trim($data["username"] ?? "");
$password = trim($data["password"] ?? "");

if ($username === "" || $password === "") {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Username and password are required"
    ]);
    exit;
}

/*
    Step 1: Check Prof_Verify table
*/
$profStmt = $conn->prepare("SELECT name, email FROM Prof_Verify WHERE name = ? LIMIT 1");

if (!$profStmt) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Failed to prepare Prof_Verify query",
        "message" => "Server error"
    ]);
    $conn->close();
    exit;
}

$profStmt->bind_param("s", $username);

if (!$profStmt->execute()) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Failed to execute Prof_Verify query",
        "message" => "Server error"
    ]);
    $profStmt->close();
    $conn->close();
    exit;
}

$profStmt->store_result();

if ($profStmt->num_rows === 0) {
    http_response_code(403);
    echo json_encode([
        "success" => false,
        "message" => "Professor name not found in Prof_Verify"
    ]);
    $profStmt->close();
    $conn->close();
    exit;
}

$profStmt->bind_result($matchedName, $email);
$profStmt->fetch();
$profStmt->close();

$matchedName = trim($matchedName);
$email = trim($email);

if ($email === "") {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Professor email is empty in Prof_Verify"
    ]);
    $conn->close();
    exit;
}

/*
    Step 2: Call register.php
    register.php inserts username + password into users
*/
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$base = $protocol . '://' . $_SERVER['HTTP_HOST'] . '/CSE442/2026-Spring/cse-442s';
$registerUrl = $base . "/api/register.php";

$registerPayload = json_encode([
    "username" => $matchedName,
    "password" => $password
]);

$ch = curl_init($registerUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
curl_setopt($ch, CURLOPT_POSTFIELDS, $registerPayload);

$registerResponse = curl_exec($ch);
$registerError = curl_error($ch);
$registerHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($registerResponse === false) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Failed to call register.php",
        "curl_error" => $registerError
    ]);
    $conn->close();
    exit;
}

$registerJson = json_decode($registerResponse, true);

$registerMessage = $registerJson["message"] ?? "";

// ? allow BOTH success AND "already exists"
$registerSucceeded =
    ($registerMessage === "Registration successful") ||
    ($registerMessage === "User already exists") ||
    ($registerMessage === "Username already exists");

if (!$registerSucceeded) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "register.php failed",
        "register_response" => $registerJson ?: $registerResponse
    ]);
    $conn->close();
    exit;
}

/*
    Step 3: Update users row with official professor email and is_prof = 1
*/
$updateStmt = $conn->prepare("
    UPDATE users
    SET email = ?, prof = 1
    WHERE username = ?
");

if (!$updateStmt) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Failed to prepare users update",
        "message" => "Server error"
    ]);
    $conn->close();
    exit;
}

$updateStmt->bind_param("ss", $email, $matchedName);

if (!$updateStmt->execute()) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Failed to update professor info in users",
        "message" => "Server error"
    ]);
    $updateStmt->close();
    $conn->close();
    exit;
}

$updateStmt->close();

/*
    Step 4: Call prof_verify.php
    prof_verify.php will generate token and send email
*/
$profVerifyUrl = $base . "/api/prof_verify.php";

$profVerifyPayload = json_encode([
    "username" => $matchedName
]);

$ch = curl_init($profVerifyUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
curl_setopt($ch, CURLOPT_POSTFIELDS, $profVerifyPayload);

$verifyResponse = curl_exec($ch);
$verifyError = curl_error($ch);
$verifyHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($verifyResponse === false) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Failed to call prof_verify.php",
        "curl_error" => $verifyError
    ]);
    $conn->close();
    exit;
}

$verifyJson = json_decode($verifyResponse, true);

if ($verifyHttpCode !== 200 || !$verifyJson || empty($verifyJson["success"])) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "prof_verify.php failed",
        "verify_response" => $verifyJson ?: $verifyResponse
    ]);
    $conn->close();
    exit;
}

echo json_encode([
    "success" => true,
    "message" => "Professor registered and verification email sent",
    "username" => $matchedName,
    "email_used" => $email,
    "register_response" => $registerJson,
    "verify_response" => $verifyJson
]);

$conn->close();
?>