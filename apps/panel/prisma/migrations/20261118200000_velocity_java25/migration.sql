-- Velocity 4.x requires Java 25; move existing proxies off the java21 image.
UPDATE "Server" SET "image" = 'itzg/mc-proxy:java25' WHERE "software" = 'VELOCITY' AND "image" = 'itzg/mc-proxy:java21';
