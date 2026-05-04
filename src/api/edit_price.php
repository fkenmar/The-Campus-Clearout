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

// Validate token
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$username = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();

// Parse request body
$data = json_decode(file_get_contents("php://input"), true);
$listing_id = $data["listing_id"] ?? null;
$new_price  = $data["price"]      ?? null;

if (!$listing_id || $new_price === null || $new_price === "") {
    http_response_code(400);
    echo json_encode(["message" => "listing_id and price are required"]);
    exit;
}

if (!is_numeric($new_price) || $new_price < 0) {
    http_response_code(400);
    echo json_encode(["message" => "Price must be a non-negative number"]);
    exit;
}

// Verify the listing belongs to the authenticated user
$checkStmt = $conn->prepare("SELECT id FROM listings WHERE id = ? AND username = ?");
$checkStmt->bind_param("is", $listing_id, $username);
$checkStmt->execute();
$checkResult = $checkStmt->get_result();

if ($checkResult->num_rows === 0) {
    http_response_code(403);
    echo json_encode(["message" => "Listing not found or you do not own this listing"]);
    exit;
}
$checkStmt->close();

// Update the price
$updateStmt = $conn->prepare("UPDATE listings SET price = ? WHERE id = ? AND username = ?");
$updateStmt->bind_param("dis", $new_price, $listing_id, $username);

if ($updateStmt->execute()) {
    echo json_encode(["message" => "Price updated successfully"]);
} else {
    http_response_code(500);
    echo json_encode(["message" => "Failed to update price"]);
}

$updateStmt->close();
$conn->close();
?>
