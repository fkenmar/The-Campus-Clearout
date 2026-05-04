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

// Add quantity column if it doesn't exist yet
$conn->query("ALTER TABLE listings ADD COLUMN quantity INT NOT NULL DEFAULT 1");

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
$listing_id  = $data["listing_id"]  ?? null;
$new_quantity = $data["quantity"]   ?? null;

if (!$listing_id || $new_quantity === null || $new_quantity === "") {
    http_response_code(400);
    echo json_encode(["message" => "listing_id and quantity are required"]);
    exit;
}

$new_quantity = (int)$new_quantity;

if ($new_quantity < 1) {
    http_response_code(400);
    echo json_encode(["message" => "Quantity must be at least 1"]);
    exit;
}

// Verify the listing belongs to the authenticated user
$checkStmt = $conn->prepare("SELECT id FROM listings WHERE id = ? AND username = ?");
$checkStmt->bind_param("is", $listing_id, $username);
$checkStmt->execute();

if ($checkStmt->get_result()->num_rows === 0) {
    http_response_code(403);
    echo json_encode(["message" => "Listing not found or you do not own this listing"]);
    exit;
}
$checkStmt->close();

// Update the quantity
$updateStmt = $conn->prepare("UPDATE listings SET quantity = ? WHERE id = ? AND username = ?");
$updateStmt->bind_param("iis", $new_quantity, $listing_id, $username);

if ($updateStmt->execute()) {
    echo json_encode(["message" => "Quantity updated successfully", "quantity" => $new_quantity]);
} else {
    http_response_code(500);
    echo json_encode(["message" => "Failed to update quantity"]);
}

$updateStmt->close();
$conn->close();
?>
