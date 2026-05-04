<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit();
}

require_once "db.php";

/* =========================
   AUTH
========================= */
$headers = getallheaders();
$authHeader = $headers["Authorization"] ?? $headers["authorization"] ?? "";

if (!$authHeader || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Unauthorized"]);
    exit();
}

$token = $matches[1];

/* =========================
   BODY
========================= */
$input = json_decode(file_get_contents("php://input"), true);

$listingId = isset($input["listing_id"]) ? intval($input["listing_id"]) : null;
$bundleId  = isset($input["bundle_id"]) ? intval($input["bundle_id"]) : null;

if (!$listingId && !$bundleId) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Missing listing_id or bundle_id"]);
    exit();
}

if ($listingId && $bundleId) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Send only one id"]);
    exit();
}

/* =========================
   USER LOOKUP
========================= */
$sessionStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? LIMIT 1");
$sessionStmt->bind_param("s", $token);
$sessionStmt->execute();
$sessionResult = $sessionStmt->get_result();

if ($sessionResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Invalid session"]);
    exit();
}

$username = $sessionResult->fetch_assoc()["username"];

$userStmt = $conn->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
$userStmt->bind_param("s", $username);
$userStmt->execute();
$userResult = $userStmt->get_result();

if ($userResult->num_rows === 0) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "User not found"]);
    exit();
}

$userId = intval($userResult->fetch_assoc()["id"]);

/* =========================
   VERIFY EXISTS
========================= */
if ($bundleId) {
    $existsStmt = $conn->prepare("SELECT id FROM bundles WHERE id = ? LIMIT 1");
    $existsStmt->bind_param("i", $bundleId);
} else {
    $existsStmt = $conn->prepare("SELECT id FROM listings WHERE id = ? LIMIT 1");
    $existsStmt->bind_param("i", $listingId);
}

$existsStmt->execute();
$existsResult = $existsStmt->get_result();

if ($existsResult->num_rows === 0) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Item not found"]);
    exit();
}

/* =========================
   TOGGLE LOGIC
========================= */
if ($bundleId) {
    // ---------- BUNDLES ----------
    $checkStmt = $conn->prepare("
        SELECT 1 FROM saved_bundles
        WHERE user_id = ? AND bundle_id = ?
        LIMIT 1
    ");
    $checkStmt->bind_param("ii", $userId, $bundleId);
    $checkStmt->execute();
    $checkResult = $checkStmt->get_result();

    if ($checkResult->num_rows > 0) {
        $deleteStmt = $conn->prepare("
            DELETE FROM saved_bundles
            WHERE user_id = ? AND bundle_id = ?
        ");
        $deleteStmt->bind_param("ii", $userId, $bundleId);
        $deleteStmt->execute();

        echo json_encode(["success" => true, "action" => "unsaved", "type" => "bundle"]);
    } else {
        $insertStmt = $conn->prepare("
            INSERT INTO saved_bundles (user_id, bundle_id)
            VALUES (?, ?)
        ");
        $insertStmt->bind_param("ii", $userId, $bundleId);
        $insertStmt->execute();

        echo json_encode(["success" => true, "action" => "saved", "type" => "bundle"]);
    }

} else {
    // ---------- LISTINGS (UNCHANGED) ----------
    $checkStmt = $conn->prepare("
        SELECT 1 FROM saved_listings
        WHERE user_id = ? AND listing_id = ?
        LIMIT 1
    ");
    $checkStmt->bind_param("ii", $userId, $listingId);
    $checkStmt->execute();
    $checkResult = $checkStmt->get_result();

    if ($checkResult->num_rows > 0) {
        $deleteStmt = $conn->prepare("
            DELETE FROM saved_listings
            WHERE user_id = ? AND listing_id = ?
        ");
        $deleteStmt->bind_param("ii", $userId, $listingId);
        $deleteStmt->execute();

        echo json_encode(["success" => true, "action" => "unsaved", "type" => "listing"]);
    } else {
        $insertStmt = $conn->prepare("
            INSERT INTO saved_listings (user_id, listing_id)
            VALUES (?, ?)
        ");
        $insertStmt->bind_param("ii", $userId, $listingId);
        $insertStmt->execute();

        echo json_encode(["success" => true, "action" => "saved", "type" => "listing"]);
    }
}
?>