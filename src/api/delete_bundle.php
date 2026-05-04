<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

require_once __DIR__ . '/db.php';

// 1. Auth
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenRes = $tokenStmt->get_result();

if ($tokenRes->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}
$username = $tokenRes->fetch_assoc()["username"];

// 2. Parse Input
$data = json_decode(file_get_contents("php://input"), true);
$bundle_id = $data["bundle_id"] ?? null;

if (!$bundle_id) {
    http_response_code(400);
    echo json_encode(["message" => "bundle_id is required"]);
    exit;
}

// 3. Verify Ownership
$checkStmt = $conn->prepare("SELECT id FROM bundles WHERE id = ? AND username = ?");
$checkStmt->bind_param("is", $bundle_id, $username);
$checkStmt->execute();
if ($checkStmt->get_result()->num_rows === 0) {
    http_response_code(403);
    echo json_encode(["message" => "Bundle not found or access denied"]);
    exit;
}

// 4. Delete Bundle and Links
// First, remove the item associations
$delItems = $conn->prepare("DELETE FROM bundle_items WHERE bundle_id = ?");
$delItems->bind_param("i", $bundle_id);
$delItems->execute();

// Then, delete the bundle record
$delBundle = $conn->prepare("DELETE FROM bundles WHERE id = ?");
$delBundle->bind_param("i", $bundle_id);

if ($delBundle->execute()) {
    echo json_encode(["message" => "Bundle deleted successfully"]);
} else {
    http_response_code(500);
    echo json_encode(["message" => "Failed to delete bundle"]);
}

$conn->close();
?>