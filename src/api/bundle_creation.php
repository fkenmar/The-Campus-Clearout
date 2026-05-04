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

// Ensure bundles and bundle_items tables exist
$conn->query("
    CREATE TABLE IF NOT EXISTS bundles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
");
$conn->query("
    CREATE TABLE IF NOT EXISTS bundle_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bundle_id INT NOT NULL,
        listing_id INT NOT NULL
    )
");

// Validate token from Authorization header
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

// Parse JSON body
$body = json_decode(file_get_contents("php://input"), true);
$title = trim($body["title"] ?? "");
$bundleItems = $body["bundleItems"] ?? [];

if (!$title) {
    http_response_code(400);
    echo json_encode(["message" => "Bundle title is required"]);
    exit;
}

if (strlen($title) > 100) {
    http_response_code(400);
    echo json_encode(["message" => "Bundle title must be 100 characters or fewer"]);
    exit;
}

if (empty($bundleItems) || !is_array($bundleItems)) {
    http_response_code(400);
    echo json_encode(["message" => "At least one item must be selected for the bundle"]);
    exit;
}

// Sanitize item IDs to positive integers only
$bundleItems = array_values(array_filter(array_map('intval', $bundleItems), fn($id) => $id > 0));

if (empty($bundleItems)) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid item IDs"]);
    exit;
}

// Verify all selected items belong to the authenticated user and are active
$placeholders = implode(',', array_fill(0, count($bundleItems), '?'));
$verifyStmt = $conn->prepare(
    "SELECT COUNT(*) AS cnt FROM listings WHERE id IN ($placeholders) AND username = ? AND active = 1"
);
$types = str_repeat('i', count($bundleItems)) . 's';
$params = array_merge($bundleItems, [$username]);
$verifyStmt->bind_param($types, ...$params);
$verifyStmt->execute();
$verifyResult = $verifyStmt->get_result()->fetch_assoc();
$verifyStmt->close();

if ((int)$verifyResult['cnt'] !== count($bundleItems)) {
    http_response_code(400);
    echo json_encode(["message" => "One or more items are invalid or do not belong to you"]);
    exit;
}

// Insert the bundle
$bundleStmt = $conn->prepare("INSERT INTO bundles (title, username) VALUES (?, ?)");
$bundleStmt->bind_param("ss", $title, $username);

if (!$bundleStmt->execute()) {
    http_response_code(500);
    echo json_encode(["message" => "Failed to create bundle"]);
    exit;
}

$bundleId = $conn->insert_id;
$bundleStmt->close();

// Insert each bundle item
$itemStmt = $conn->prepare("INSERT INTO bundle_items (bundle_id, listing_id) VALUES (?, ?)");
foreach ($bundleItems as $listingId) {
    $itemStmt->bind_param("ii", $bundleId, $listingId);
    $itemStmt->execute();
}
$itemStmt->close();

echo json_encode(["message" => "Bundle created", "id" => $bundleId]);

$conn->close();
?>
