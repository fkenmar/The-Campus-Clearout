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

// ==========================================
// 1. AUTH & GET USER ID (For 'Saved' Check)
// ==========================================
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

// Get numeric user ID for the saved_listings join
$userStmt = $conn->prepare("SELECT id FROM users WHERE username = ?");
$userStmt->bind_param("s", $current_username);
$userStmt->execute();
$userResult = $userStmt->get_result();
$userId = ($userResult->num_rows > 0) ? intval($userResult->fetch_assoc()['id']) : 0;
$userStmt->close();

// ==========================================
// 2. PROCESS SEARCH REQUEST
// ==========================================
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $searchTerm = trim($_GET['query'] ?? '');
    $storeFilter = trim($_GET['store'] ?? ''); 

    if (empty($searchTerm)) {
        http_response_code(200);
        echo json_encode([]);
        exit;
    }

    $all_results = [];
    $searchTermLike = '%' . $searchTerm . '%';

    // ==========================================
    // PHASE 1: FULL-TEXT (Listings) & LIKE (Bundles)
    // ==========================================
    if ($storeFilter) {
        $stmt_l = $conn->prepare("
            SELECT l.id, l.title, l.price, l.quantity, l.image, l.username, l.description, l.tags,
                   u.profile_photo, 0 AS is_bundle, l.created_at,
                   CASE WHEN s.listing_id IS NOT NULL THEN 1 ELSE 0 END AS is_saved
            FROM listings l
            LEFT JOIN users u ON l.username = u.username
            LEFT JOIN saved_listings s ON s.listing_id = l.id AND s.user_id = ?
            WHERE MATCH(l.title, l.description, l.tags) AGAINST(? IN NATURAL LANGUAGE MODE) AND l.active = 1 AND l.username = ?
        ");
        
        $stmt_b = $conn->prepare("
            SELECT b.id, b.title,
                   (SELECT COALESCE(SUM(li.price), 0) FROM bundle_items bi JOIN listings li ON bi.listing_id = li.id WHERE bi.bundle_id = b.id) AS price,
                   NULL AS quantity,
                   (SELECT li.image FROM bundle_items bi JOIN listings li ON bi.listing_id = li.id WHERE bi.bundle_id = b.id LIMIT 1) AS image,
                   b.username,
                   CONCAT('Bundle of ', (SELECT COUNT(*) FROM bundle_items bi2 WHERE bi2.bundle_id = b.id), ' items') AS description,
                   NULL AS tags, u.profile_photo, 1 AS is_bundle, b.created_at, 0 AS is_saved
            FROM bundles b
            LEFT JOIN users u ON b.username = u.username
            WHERE b.title LIKE ? AND b.username = ?
        ");
    } else {
        $stmt_l = $conn->prepare("
            SELECT l.id, l.title, l.price, l.quantity, l.image, l.username, l.description, l.tags,
                   u.profile_photo, 0 AS is_bundle, l.created_at,
                   CASE WHEN s.listing_id IS NOT NULL THEN 1 ELSE 0 END AS is_saved
            FROM listings l
            LEFT JOIN users u ON l.username = u.username
            LEFT JOIN saved_listings s ON s.listing_id = l.id AND s.user_id = ?
            WHERE MATCH(l.title, l.description, l.tags) AGAINST(? IN NATURAL LANGUAGE MODE) AND l.active = 1
        ");
        
        $stmt_b = $conn->prepare("
            SELECT b.id, b.title,
                   (SELECT COALESCE(SUM(li.price), 0) FROM bundle_items bi JOIN listings li ON bi.listing_id = li.id WHERE bi.bundle_id = b.id) AS price,
                   NULL AS quantity,
                   (SELECT li.image FROM bundle_items bi JOIN listings li ON bi.listing_id = li.id WHERE bi.bundle_id = b.id LIMIT 1) AS image,
                   b.username,
                   CONCAT('Bundle of ', (SELECT COUNT(*) FROM bundle_items bi2 WHERE bi2.bundle_id = b.id), ' items') AS description,
                   NULL AS tags, u.profile_photo, 1 AS is_bundle, b.created_at, 0 AS is_saved
            FROM bundles b
            LEFT JOIN users u ON b.username = u.username
            WHERE b.title LIKE ?
        ");
    }

    if (!$stmt_l) { http_response_code(500); echo json_encode(["message" => "Listings SQL Error: " . $conn->error]); exit; }
    if (!$stmt_b) { http_response_code(500); echo json_encode(["message" => "Bundles SQL Error: " . $conn->error]); exit; }

    // Execute Listings
    if ($storeFilter) {
        $stmt_l->bind_param("iss", $userId, $searchTerm, $storeFilter);
    } else {
        $stmt_l->bind_param("is", $userId, $searchTerm);
    }
    $stmt_l->execute();
    $listings = $stmt_l->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt_l->close();

    // Execute Bundles
    if ($storeFilter) {
        $stmt_b->bind_param("ss", $searchTermLike, $storeFilter);
    } else {
        $stmt_b->bind_param("s", $searchTermLike);
    }
    $stmt_b->execute();
    $bundles = $stmt_b->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt_b->close();

    $all_results = array_merge($listings, $bundles);

    // ==========================================
    // PHASE 2: TYPO TOLERANCE (SOUNDEX)
    // ==========================================
    if (empty($all_results)) {
        if ($storeFilter) {
            $stmt2_l = $conn->prepare("
                SELECT l.id, l.title, l.price, l.quantity, l.image, l.username, l.description, l.tags,
                       u.profile_photo, 0 AS is_bundle, l.created_at,
                       CASE WHEN s.listing_id IS NOT NULL THEN 1 ELSE 0 END AS is_saved
                FROM listings l
                LEFT JOIN users u ON l.username = u.username
                LEFT JOIN saved_listings s ON s.listing_id = l.id AND s.user_id = ?
                WHERE SOUNDEX(l.title) = SOUNDEX(?) AND l.active = 1 AND l.username = ?
            ");
            
            $stmt2_b = $conn->prepare("
                SELECT b.id, b.title,
                       (SELECT COALESCE(SUM(li.price), 0) FROM bundle_items bi JOIN listings li ON bi.listing_id = li.id WHERE bi.bundle_id = b.id) AS price,
                       NULL AS quantity,
                       (SELECT li.image FROM bundle_items bi JOIN listings li ON bi.listing_id = li.id WHERE bi.bundle_id = b.id LIMIT 1) AS image,
                       b.username,
                       CONCAT('Bundle of ', (SELECT COUNT(*) FROM bundle_items bi2 WHERE bi2.bundle_id = b.id), ' items') AS description,
                       NULL AS tags, u.profile_photo, 1 AS is_bundle, b.created_at, 0 AS is_saved
                FROM bundles b
                LEFT JOIN users u ON b.username = u.username
                WHERE SOUNDEX(b.title) = SOUNDEX(?) AND b.username = ?
            ");
        } else {
            $stmt2_l = $conn->prepare("
                SELECT l.id, l.title, l.price, l.quantity, l.image, l.username, l.description, l.tags,
                       u.profile_photo, 0 AS is_bundle, l.created_at,
                       CASE WHEN s.listing_id IS NOT NULL THEN 1 ELSE 0 END AS is_saved
                FROM listings l
                LEFT JOIN users u ON l.username = u.username
                LEFT JOIN saved_listings s ON s.listing_id = l.id AND s.user_id = ?
                WHERE SOUNDEX(l.title) = SOUNDEX(?) AND l.active = 1
            ");
            
            $stmt2_b = $conn->prepare("
                SELECT b.id, b.title,
                       (SELECT COALESCE(SUM(li.price), 0) FROM bundle_items bi JOIN listings li ON bi.listing_id = li.id WHERE bi.bundle_id = b.id) AS price,
                       NULL AS quantity,
                       (SELECT li.image FROM bundle_items bi JOIN listings li ON bi.listing_id = li.id WHERE bi.bundle_id = b.id LIMIT 1) AS image,
                       b.username,
                       CONCAT('Bundle of ', (SELECT COUNT(*) FROM bundle_items bi2 WHERE bi2.bundle_id = b.id), ' items') AS description,
                       NULL AS tags, u.profile_photo, 1 AS is_bundle, b.created_at, 0 AS is_saved
                FROM bundles b
                LEFT JOIN users u ON b.username = u.username
                WHERE SOUNDEX(b.title) = SOUNDEX(?)
            ");
        }

        if (!$stmt2_l) { http_response_code(500); echo json_encode(["message" => "Listings Soundex SQL Error: " . $conn->error]); exit; }
        if (!$stmt2_b) { http_response_code(500); echo json_encode(["message" => "Bundles Soundex SQL Error: " . $conn->error]); exit; }

        // Execute Listings Soundex
        if ($storeFilter) {
            $stmt2_l->bind_param("iss", $userId, $searchTerm, $storeFilter);
        } else {
            $stmt2_l->bind_param("is", $userId, $searchTerm);
        }
        $stmt2_l->execute();
        $snd_listings = $stmt2_l->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt2_l->close();

        // Execute Bundles Soundex
        if ($storeFilter) {
            $stmt2_b->bind_param("ss", $searchTerm, $storeFilter);
        } else {
            $stmt2_b->bind_param("s", $searchTerm);
        }
        $stmt2_b->execute();
        $snd_bundles = $stmt2_b->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt2_b->close();

        $all_results = array_merge($snd_listings, $snd_bundles);
    }

    // ==========================================
    // PHASE 3: FETCH IMAGES FOR BUNDLES 
    // (Matches listings.php exactly for BundleCollage)
    // ==========================================
    foreach ($all_results as &$row) {
        if ($row['is_bundle'] == 1) {
            $bundleId = intval($row['id']);

            $itemsStmt = $conn->prepare("
                SELECT l.id, l.title, l.price, l.image, l.description
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

    // Sort combined results so newest items always show first
    usort($all_results, fn($a, $b) => strtotime($b['created_at']) - strtotime($a['created_at']));

    http_response_code(200);
    echo json_encode($all_results);

} else {
    http_response_code(405);
    echo json_encode(["message" => "Method not allowed"]);
}

$conn->close();
?>