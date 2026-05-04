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

// 1. Authenticate User Token
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
    echo json_encode(["message" => "Invalid token"]);
    exit;
}
// We don't strictly need the viewer's username for the store data, but we verify the token to ensure they are logged in.
$tokenStmt->close();

// 2. Get the target store username from the URL parameters
$target_username = $_GET['username'] ?? '';

if (empty($target_username)) {
    http_response_code(400);
    echo json_encode(["message" => "Store username is required"]);
    exit;
}

// 3. Get User Profile Data
$profileStmt = $conn->prepare("SELECT username, profile_photo FROM users WHERE username = ?");
$profileStmt->bind_param("s", $target_username);
$profileStmt->execute();
$profileResult = $profileStmt->get_result();

if ($profileResult->num_rows === 0) {
    http_response_code(404);
    echo json_encode(["message" => "Store not found"]);
    exit;
}
$profile = $profileResult->fetch_assoc();
$profileStmt->close();

// 4. Get Active Listings
$listingsStmt = $conn->prepare("SELECT id, title, price, image, description, tags as tag FROM listings WHERE username = ? AND active = 1 ORDER BY id DESC");
$listingsStmt->bind_param("s", $target_username);
$listingsStmt->execute();
$listingsRows = $listingsStmt->get_result()->fetch_all(MYSQLI_ASSOC);
$listingsStmt->close();

// Clean up listing data types for JSON
$active_listings = array_map(function($l) {
    $l['id'] = (int)$l['id'];
    $l['price'] = (float)$l['price'];
    return $l;
}, $listingsRows);

// 5. Get Reviews and calculate stats
// We JOIN the users table so we can get the reviewer's profile picture for the frontend feed
$reviewsStmt = $conn->prepare("
    SELECT r.id, r.reviewer_username, r.rating_score, r.review_text, r.created_at, u.profile_photo as reviewer_photo
    FROM reviews r
    LEFT JOIN users u ON r.reviewer_username = u.username
    WHERE r.target_username = ?
    ORDER BY r.created_at DESC
");
$reviewsStmt->bind_param("s", $target_username);
$reviewsStmt->execute();
$reviewsRows = $reviewsStmt->get_result()->fetch_all(MYSQLI_ASSOC);
$reviewsStmt->close();

$total_reviews = count($reviewsRows);
$sum_ratings = 0;

$reviews = array_map(function($r) use (&$sum_ratings) {
    $sum_ratings += (int)$r['rating_score'];
    return [
        "id" => (int)$r['id'],
        "reviewer" => $r['reviewer_username'],
        "reviewer_photo" => $r['reviewer_photo'],
        "score" => (int)$r['rating_score'],
        "text" => $r['review_text'],
        "date" => date("Y-m-d", strtotime($r['created_at']))
    ];
}, $reviewsRows);

// Calculate the average rating (rounded to 1 decimal place)
$average_rating = $total_reviews > 0 ? round($sum_ratings / $total_reviews, 1) : 0;

// 6. Get Bundles
$conn->query("CREATE TABLE IF NOT EXISTS bundles (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL, price_override DECIMAL(10,2) DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
$conn->query("CREATE TABLE IF NOT EXISTS bundle_items (id INT AUTO_INCREMENT PRIMARY KEY, bundle_id INT NOT NULL, listing_id INT NOT NULL)");
$conn->query("ALTER TABLE bundles ADD COLUMN price_override DECIMAL(10,2) DEFAULT NULL");

$bundlesStmt = $conn->prepare("
    SELECT b.id, b.title,
        COALESCE(b.price_override, (SELECT SUM(l.price) FROM bundle_items bi JOIN listings l ON bi.listing_id = l.id WHERE bi.bundle_id = b.id)) AS price,
        (SELECT l.image FROM bundle_items bi JOIN listings l ON bi.listing_id = l.id WHERE bi.bundle_id = b.id LIMIT 1) AS image,
        CONCAT('Bundle of ', (SELECT COUNT(*) FROM bundle_items bi2 WHERE bi2.bundle_id = b.id), ' items') AS description,
        1 AS is_bundle
    FROM bundles b
    WHERE b.username = ?
    ORDER BY b.id DESC
");
$bundlesStmt->bind_param("s", $target_username);
$bundlesStmt->execute();
$bundlesRows = $bundlesStmt->get_result()->fetch_all(MYSQLI_ASSOC);
$bundlesStmt->close();

$active_bundles = array_map(function($b) {
    $b['id'] = (int)$b['id'];
    $b['price'] = (float)$b['price'];
    $b['is_bundle'] = 1;
    return $b;
}, $bundlesRows);

// 7. Build the final JSON package
$response = [
    "profile" => [
        "username" => $profile['username'],
        "profile_photo" => $profile['profile_photo']
    ],
    "stats" => [
        "average_rating" => $average_rating,
        "total_reviews" => $total_reviews
    ],
    "active_listings" => $active_listings,
    "active_bundles" => $active_bundles,
    "reviews" => $reviews
];

http_response_code(200);
echo json_encode($response);

$conn->close();
?>