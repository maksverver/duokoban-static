CREATE TABLE levels (
        level_id    SERIAL,
        code        TEXT NOT NULL UNIQUE,
        title       TEXT NOT NULL,
        author      TEXT NOT NULL,
        created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() );
