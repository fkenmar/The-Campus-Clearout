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

// Ensure expires_at column exists
$conn->query("ALTER TABLE user_sessions ADD COLUMN expires_at DATETIME DEFAULT NULL");

// Validate token from Authorization header
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
");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$sessionRow = $tokenResult->fetch_assoc();
$username = $sessionRow['username'];
$tokenStmt->close();

// Look up numeric user id for saved_listings join
$userStmt = $conn->prepare("
    SELECT id
    FROM users
    WHERE username = ?
");
$userStmt->bind_param("s", $username);
$userStmt->execute();
$userResult = $userStmt->get_result();

if ($userResult->num_rows === 0) {
    http_response_code(404);
    echo json_encode(["message" => "User not found"]);
    exit;
}

$userRow = $userResult->fetch_assoc();
$userId = intval($userRow['id']);
$userStmt->close();

$conn->query("ALTER TABLE listings ADD COLUMN description TEXT DEFAULT NULL");
$conn->query("ALTER TABLE listings ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");

// Ensure bundles tables exist so the UNION doesn't fail
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

// Fetch regular listings with is_saved
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
        u.profile_photo,
        0 AS is_bundle,
        l.created_at,
        CASE WHEN s.listing_id IS NOT NULL THEN 1 ELSE 0 END AS is_saved
    FROM listings l
    LEFT JOIN users u ON l.username = u.username
    LEFT JOIN saved_listings s
        ON s.listing_id = l.id
       AND s.user_id = ?
    WHERE l.active = 1
    ORDER BY l.id DESC
");

$listingsStmt->bind_param("i", $userId);
$listingsStmt->execute();
$result = $listingsStmt->get_result();

if (!$result) {
    http_response_code(500);
    echo json_encode(["message" => "Query failed"]);
    exit;
}

$listings = [];
while ($row = $result->fetch_assoc()) {
    $listings[] = $row;
}
$listingsStmt->close();

// Fetch bundles and append
$bundleResult = $conn->query("
    SELECT
        b.id,
        b.title,
        (SELECT COALESCE(SUM(li.price), 0)
         FROM bundle_items bi
         JOIN listings li ON bi.listing_id = li.id
         WHERE bi.bundle_id = b.id) AS price,
        NULL AS quantity,
        (SELECT li.image
         FROM bundle_items bi
         JOIN listings li ON bi.listing_id = li.id
         WHERE bi.bundle_id = b.id
         LIMIT 1) AS image,
        b.username,
        CONCAT('Bundle of ', (SELECT COUNT(*) FROM bundle_items bi2 WHERE bi2.bundle_id = b.id), ' items') AS description,
        NULL AS tags,
        u.profile_photo,
        1 AS is_bundle,
        b.created_at,
        0 AS is_saved
    FROM bundles b
    LEFT JOIN users u ON b.username = u.username
    ORDER BY b.id DESC
");

if ($bundleResult) {
    while ($row = $bundleResult->fetch_assoc()) {
        $listings[] = $row;
    }
}

// Sort all listings and bundles together by created_at DESC (newest first)
usort($listings, fn($a, $b) => strtotime($b['created_at']) - strtotime($a['created_at']));

foreach ($listings as &$row) {
    if ($row['is_bundle'] == 1) {
        $bundleId = intval($row['id']);

        $itemsStmt = $conn->prepare("
            SELECT 
                l.id,
                l.title,
                l.price,
                l.image,
                l.description
            FROM bundle_items bi
            JOIN listings l ON bi.listing_id = l.id
            WHERE bi.bundle_id = ?
        ");
        $itemsStmt->bind_param("i", $bundleId);
        $itemsStmt->execute();
        $itemsResult = $itemsStmt->get_result();

        $row['items'] = [];
        while ($item = $itemsResult->fetch_assoc()) {
            $row['items'][] = $item;
        }

        $itemsStmt->close();
    }
}
unset($row);

echo json_encode($listings);

$conn->close();
?>