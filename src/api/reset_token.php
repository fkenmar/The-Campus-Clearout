<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, OPTIONS");
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

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    echo json_encode(["success" => false, "message" => "Invalid request"]);
    exit();
}

if (!isset($_GET["token"])) {
    echo json_encode(["success" => false, "message" => "Missing token"]);
    exit();
}

$token = trim($_GET["token"]);

if ($token === "") {
    echo json_encode(["success" => false, "message" => "Missing token"]);
    exit();
}

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

echo json_encode([
    "success" => true,
    "message" => "Token is valid",
    "username" => $row["username"]
]);

$stmt->close();
$conn->close();
?>