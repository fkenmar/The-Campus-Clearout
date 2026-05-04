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

// Add price_override column if it doesn't exist
$conn->query("ALTER TABLE bundles ADD COLUMN price_override DECIMAL(10,2) DEFAULT NULL");

// Auth
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

$data = json_decode(file_get_contents("php://input"), true);
$bundle_id = (int)($data['bundle_id'] ?? 0);
$price = $data['price'] ?? null;

if ($bundle_id <= 0) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid bundle ID"]);
    exit;
}

$price = filter_var($price, FILTER_VALIDATE_FLOAT);
if ($price === false || $price < 0) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid price"]);
    exit;
}

// Verify ownership
$checkStmt = $conn->prepare("SELECT id FROM bundles WHERE id = ? AND username = ?");
$checkStmt->bind_param("is", $bundle_id, $username);
$checkStmt->execute();
if ($checkStmt->get_result()->num_rows === 0) {
    http_response_code(403);
    echo json_encode(["message" => "You do not own this bundle"]);
    exit;
}
$checkStmt->close();

$updateStmt = $conn->prepare("UPDATE bundles SET price_override = ? WHERE id = ?");
$updateStmt->bind_param("di", $price, $bundle_id);

if ($updateStmt->execute()) {
    echo json_encode(["message" => "Bundle price updated", "price" => round($price, 2)]);
} else {
    http_response_code(500);
    echo json_encode(["message" => "Failed to update price"]);
}

$updateStmt->close();
$conn->close();
?>
