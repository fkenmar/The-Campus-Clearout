<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS, POST");
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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["message" => "Invalid request method"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);

if (!isset($input['username']) || empty($input['username'])) {
    http_response_code(400);
    echo json_encode(["message" => "Username is required"]);
    exit;
}

$username = $input['username'];

// PREPARED STATEMENT — prevents SQL injection completely
$stmt = $conn->prepare("
    SELECT AVG(rating_score) AS avg_rating
    FROM reviews
    WHERE target_username = ?
");

$stmt->bind_param("s", $username);
$stmt->execute();
$result = $stmt->get_result();

if (!$result) {
    http_response_code(500);
    echo json_encode(["message" => "Query failed"]);
    exit;
}

$row = $result->fetch_assoc();

if ($row['avg_rating'] === null) {
    echo json_encode([
        "message" => "Successful",
        "rating" => "N/A"
    ]);
    exit;
}

$rating = number_format((float)$row['avg_rating'], 1);

echo json_encode([
    "message" => "Successful",
    "rating" => $rating
]);
exit;