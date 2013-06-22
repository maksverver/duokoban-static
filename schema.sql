CREATE TABLE levels (
        level_id        SERIAL PRIMARY KEY,
        code            TEXT NOT NULL UNIQUE,
        title           TEXT NOT NULL,
        author          TEXT NOT NULL,

        created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() );

CREATE TABLE votes (
        level_id    INTEGER REFERENCES levels(level_id) ON DELETE CASCADE,
        property    VARCHAR(10),
        value       REAL NOT NULL,
        sum         INTEGER NOT NULL DEFAULT(0),
        count       INTEGER NOT NULL DEFAULT(0),

        PRIMARY KEY(level_id, property) );

CREATE INDEX votes_value_index ON votes(value);
