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

if (strlen($username) > 50) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Username must be 50 characters or fewer"
    ]);
    exit;
}

/*
    Insert new user (names are no longer unique; email uniqueness is enforced in verify.php)
*/
$hashed = password_hash($password, PASSWORD_DEFAULT);

$stmt = $conn->prepare("
    INSERT INTO users (username, password)
    VALUES (?, ?)
");

if (!$stmt) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Failed to prepare insert",
        "message" => "Server error"
    ]);
    $conn->close();
    exit;
}

$stmt->bind_param("ss", $username, $hashed);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Registration failed",
        "message" => "Server error"
    ]);
    $stmt->close();
    $conn->close();
    exit;
}

$newUserId = $stmt->insert_id;

$stmt->close();

echo json_encode([
    "success" => true,
    "message" => "Registration successful",
    "user_id" => $newUserId,
    "action" => "inserted"
]);

$conn->close();
?>