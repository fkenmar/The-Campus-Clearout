<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["message" => "Database connection failed"]);
    exit;
}

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
$tokenStmt->close();

// 2. Parse Input
$data = json_decode(file_get_contents("php://input"), true);
$listing_id = $data["listing_id"] ?? null;

if (!$listing_id) {
    http_response_code(400);
    echo json_encode(["message" => "listing_id is required"]);
    exit;
}

// 3. Find bundles containing this item before we delete it
$affectedBundles = [];
$findStmt = $conn->prepare("SELECT DISTINCT bundle_id FROM bundle_items WHERE listing_id = ?");
$findStmt->bind_param("i", $listing_id);
$findStmt->execute();
$res = $findStmt->get_result();
while($row = $res->fetch_assoc()) { 
    $affectedBundles[] = $row['bundle_id']; 
}
$findStmt->close();

// 4. Manually remove the item from all bundles first
// This ensures the count in the next step is accurate even without database CASCADE
$clearLinkStmt = $conn->prepare("DELETE FROM bundle_items WHERE listing_id = ?");
$clearLinkStmt->bind_param("i", $listing_id);
$clearLinkStmt->execute();
$clearLinkStmt->close();

// 5. Delete the listing itself
$deleteStmt = $conn->prepare("DELETE FROM listings WHERE id = ? AND username = ?");
$deleteStmt->bind_param("is", $listing_id, $username);

if ($deleteStmt->execute()) {
    // 6. AUTOMATED BUNDLE CLEANUP
    // Now that the item is gone from bundle_items, check if any bundles are empty
    foreach ($affectedBundles as $bid) {
        $countStmt = $conn->prepare("SELECT COUNT(*) as item_count FROM bundle_items WHERE bundle_id = ?");
        $countStmt->bind_param("i", $bid);
        $countStmt->execute();
        $countRes = $countStmt->get_result()->fetch_assoc();
        $countStmt->close();

        // If the bundle is now empty, delete the bundle entry
        if ((int)$countRes['item_count'] === 0) {
            $delBundleStmt = $conn->prepare("DELETE FROM bundles WHERE id = ?");
            $delBundleStmt->bind_param("i", $bid);
            $delBundleStmt->execute();
            $delBundleStmt->close();
        }
    }

    echo json_encode(["message" => "Listing deleted and empty bundles removed successfully"]);
} else {
    http_response_code(500);
    echo json_encode(["message" => "Failed to delete listing"]);
}

$deleteStmt->close();
$conn->close();
?>