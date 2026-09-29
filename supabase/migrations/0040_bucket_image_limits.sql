-- 0040 (SEC-028, SEC-005): every photo bucket accepts only raster images a
-- guest's browser can display, and nothing larger than the Storage platform
-- limit. SVG is excluded on purpose (it can carry script, and the buckets are
-- public); so is anything that isn't an image. Storage enforces this on the
-- declared content type of every upload, including signed uploads.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
    file_size_limit = 52428800 -- 50 MB, the Storage default maximum; no lower product limit (SEC-005 decision)
where id in ('menu-item-photos', 'event-showcase-photos', 'invitation-photos');
