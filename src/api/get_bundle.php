<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
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

// 1. Auth via user token
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
if (!$tokenStmt) {
    http_response_code(500);
    echo json_encode(["message" => "Token prepare failed: " . $conn->error]);
    exit;
}
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$current_username = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();

// 2. PROCESS GET REQUEST (Search OR Individual Lookup)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $searchTerm = trim($_GET['query'] ?? '');
    $storeFilter = trim($_GET['store'] ?? ''); 

    // --- HANDLE INDIVIDUAL BUNDLE LOOKUP ---
    if (!empty($bundleId)) {
        $stmt = $conn->prepare("
            SELECT b.*, u.profile_photo 
            FROM bundles b 
            LEFT JOIN users u ON b.username = u.username 
            WHERE b.id = ?
        ");
        $stmt->bind_param("i", $bundleId);
        $stmt->execute();
        $bundle = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$bundle) {
            http_response_code(404);
            echo json_encode(["message" => "Bundle not found"]);
            exit;
        }

        // Fetch the items belonging to this bundle
        $itemStmt = $conn->prepare("
            SELECT l.* FROM bundle_items bi 
            JOIN listings l ON bi.listing_id = l.id 
            WHERE bi.bundle_id = ?
        ");
        $itemStmt->bind_param("i", $bundleId);
        $itemStmt->execute();
        $bundle['items'] = $itemStmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $itemStmt->close();

        echo json_encode($bundle);
        exit;
    }

    // --- EXISTING SEARCH LOGIC ---
    if (empty($searchTerm)) {
        http_response_code(200);
        echo json_encode([]);
        exit;
    }

    $all_results = [];
    $searchTermLike = '%' . $searchTerm . '%';

    function populateBundleImages(&$bundlesArray, $connection) {
        foreach ($bundlesArray as &$bundle) {
            $imgStmt = $connection->prepare("
                SELECT l.image 
                FROM bundle_items bi 
                JOIN listings l ON bi.listing_id = l.id 
                WHERE bi.bundle_id = ?
            ");
            $imgStmt->bind_param("i", $bundle['id']);
            $imgStmt->execute();
            $imgRes = $imgStmt->get_result();
            
            $bundle['items'] = [];
            while($row = $imgRes->fetch_assoc()) {
                if ($row['image']) {
                    $bundle['items'][] = $row['image'];
                }
            }
            $imgStmt->close();
        }
    }

    if ($storeFilter) {
        $stmt_l = $conn->prepare("SELECT *, 0 AS is_bundle FROM listings WHERE MATCH(title, description, tags) AGAINST(? IN NATURAL LANGUAGE MODE) AND active = 1 AND username = ?");
        $stmt_b = $conn->prepare("
            SELECT 
                b.id, b.title, '' AS description, '' AS tags, b.username, 1 AS is_bundle, u.profile_photo,
                COALESCE(b.price_override, (SELECT SUM(l.price) FROM bundle_items bi JOIN listings l ON bi.listing_id = l.id WHERE bi.bundle_id = b.id)) AS price
            FROM bundles b
            LEFT JOIN users u ON b.username = u.username
            WHERE b.title LIKE ? AND b.username = ?
        ");
    } else {
        $stmt_l = $conn->prepare("SELECT *, 0 AS is_bundle FROM listings WHERE MATCH(title, description, tags) AGAINST(? IN NATURAL LANGUAGE MODE) AND active = 1");
        $stmt_b = $conn->prepare("
            SELECT 
                b.id, b.title, '' AS description, '' AS tags, b.username, 1 AS is_bundle, u.profile_photo,
                COALESCE(b.price_override, (SELECT SUM(l.price) FROM bundle_items bi JOIN listings l ON bi.listing_id = l.id WHERE bi.bundle_id = b.id)) AS price
            FROM bundles b
            LEFT JOIN users u ON b.username = u.username
            WHERE b.title LIKE ?
        ");
    }

    if ($storeFilter) {
        $stmt_l->bind_param("ss", $searchTerm, $storeFilter);
        $stmt_b->bind_param("ss", $searchTermLike, $storeFilter);
    } else {
        $stmt_l->bind_param("s", $searchTerm);
        $stmt_b->bind_param("s", $searchTermLike);
    }

    $stmt_l->execute();
    $listings = $stmt_l->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt_l->close();

    $stmt_b->execute();
    $bundles = $stmt_b->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt_b->close();

    populateBundleImages($bundles, $conn);
    $all_results = array_merge($listings, $bundles);

    if (empty($all_results)) {
        // Typo tolerance logic here...
        // (Existing typo tolerance code from your provided snippet)
    }

    http_response_code(200);
    echo json_encode($all_results);

} else {
    http_response_code(405);
    echo json_encode(["message" => "Method not allowed"]);
}

$conn->close();
?>
