<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
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

/* =========================
   VALIDATE TOKEN
========================= */
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare("
    SELECT username
    FROM user_sessions
    WHERE token = ?
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$username = $tokenResult->fetch_assoc()['username'];
$tokenStmt->close();

/* =========================
   GET USER ID
========================= */
$userStmt = $conn->prepare("
    SELECT id
    FROM users
    WHERE username = ?
    LIMIT 1
");
$userStmt->bind_param("s", $username);
$userStmt->execute();
$userResult = $userStmt->get_result();

if ($userResult->num_rows === 0) {
    http_response_code(404);
    echo json_encode(["message" => "User not found"]);
    exit;
}

$userId = intval($userResult->fetch_assoc()['id']);
$userStmt->close();

/* =========================
   GET SAVED LISTINGS
========================= */
$listingsStmt = $conn->prepare("
    SELECT
        l.id,
        l.title,
        l.price,
        l.quantity,
        l.image,
        l.username,
        l.description,
        l.tags,
        l.active,
        u.profile_photo,
        0 AS is_bundle
    FROM saved_listings s
    JOIN listings l ON s.listing_id = l.id
    LEFT JOIN users u ON l.username = u.username
    WHERE s.user_id = ?
    ORDER BY s.listing_id DESC
");

if (!$listingsStmt) {
    http_response_code(500);
    echo json_encode(["message" => "Failed to prepare saved listings query"]);
    exit;
}

$listingsStmt->bind_param("i", $userId);
$listingsStmt->execute();
$listingsResult = $listingsStmt->get_result();

$savedItems = [];

while ($row = $listingsResult->fetch_assoc()) {
    $row["is_bundle"] = 0;
    $savedItems[] = $row;
}

$listingsStmt->close();

/* =========================
   GET SAVED BUNDLES
========================= */
$bundlesStmt = $conn->prepare("
    SELECT
        b.id,
        b.title,
        b.username,
        u.profile_photo,
        1 AS is_bundle
    FROM saved_bundles sb
    JOIN bundles b ON sb.bundle_id = b.id
    LEFT JOIN users u ON b.username = u.username
    WHERE sb.user_id = ?
    ORDER BY sb.bundle_id DESC
");

if (!$bundlesStmt) {
    http_response_code(500);
    echo json_encode(["message" => "Failed to prepare saved bundles query"]);
    exit;
}

$bundlesStmt->bind_param("i", $userId);
$bundlesStmt->execute();
$bundlesResult = $bundlesStmt->get_result();

while ($bundle = $bundlesResult->fetch_assoc()) {
    $bundleId = intval($bundle["id"]);

    $itemsStmt = $conn->prepare("
        SELECT
            l.id,
            l.title,
            l.price,
            l.image,
            l.description,
            l.tags
        FROM bundle_items bi
        JOIN listings l ON bi.listing_id = l.id
        WHERE bi.bundle_id = ?
          AND l.active = 1
    ");

    if (!$itemsStmt) {
        http_response_code(500);
        echo json_encode(["message" => "Failed to prepare bundle items query"]);
        exit;
    }

    $itemsStmt->bind_param("i", $bundleId);
    $itemsStmt->execute();
    $itemsResult = $itemsStmt->get_result();

    $bundleItems = [];
    $bundlePrice = 0;

    while ($item = $itemsResult->fetch_assoc()) {
        $bundleItems[] = $item;
        $bundlePrice += floatval($item["price"]);
    }

    $itemsStmt->close();

    $bundle["is_bundle"] = 1;
    $bundle["items"] = $bundleItems;
    $bundle["price"] = $bundlePrice;
    $bundle["quantity"] = count($bundleItems);
    $bundle["image"] = null;
    $bundle["description"] = "Bundle of " . count($bundleItems) . " items";
    $bundle["tags"] = "";

    $savedItems[] = $bundle;
}

$bundlesStmt->close();

echo json_encode($savedItems);

$conn->close();
?>
