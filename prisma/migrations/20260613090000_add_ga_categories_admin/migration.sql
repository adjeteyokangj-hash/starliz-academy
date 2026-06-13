CREATE TABLE "GaCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "usedByWordBank" BOOLEAN NOT NULL DEFAULT true,
    "usedByLessons" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GaCategory_name_key" ON "GaCategory"("name");
CREATE UNIQUE INDEX "GaCategory_slug_key" ON "GaCategory"("slug");
CREATE INDEX "GaCategory_isActive_isArchived_idx" ON "GaCategory"("isActive", "isArchived");
CREATE INDEX "GaCategory_usedByWordBank_isActive_idx" ON "GaCategory"("usedByWordBank", "isActive");
CREATE INDEX "GaCategory_usedByLessons_isActive_idx" ON "GaCategory"("usedByLessons", "isActive");

INSERT INTO "GaCategory" ("id", "name", "slug", "description", "isActive", "isArchived", "usedByWordBank", "usedByLessons", "createdAt", "updatedAt") VALUES
    ('ga_category_greetings', 'Greetings', 'greetings', 'Core greetings and social phrases.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_time', 'Time', 'time', 'Time words and temporal references.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_days', 'Days', 'days', 'Days and calendar language.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_alphabet', 'Alphabet', 'alphabet', 'Alphabet letters and letter learning.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_numbers', 'Numbers', 'numbers', 'Number words and counting language.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_family', 'Family', 'family', 'Family member and relationship vocabulary.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_people', 'People', 'people', 'People, roles, and identity words.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_body', 'Body', 'body', 'Body parts and physical descriptors.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_health', 'Health', 'health', 'Health and wellbeing vocabulary.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_animals', 'Animals', 'animals', 'Animal names and related terms.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_food', 'Food', 'food', 'Food and meal vocabulary.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_home', 'Home', 'home', 'Home and household terms.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_objects', 'Objects', 'objects', 'Everyday objects and item names.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_school', 'School', 'school', 'School and classroom vocabulary.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_actions', 'Actions', 'actions', 'Action verbs and instructions.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_grammar', 'Grammar', 'grammar', 'Grammar and structure-focused terms.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_shapes', 'Shapes', 'shapes', 'Shape names and geometry terms.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_transport', 'Transport', 'transport', 'Transport and travel words.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_sports', 'Sports', 'sports', 'Sports and movement vocabulary.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_feelings', 'Feelings', 'feelings', 'Feelings and emotional expression.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_places', 'Places', 'places', 'Places, locations, and directions.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ga_category_professions', 'Professions', 'professions', 'Jobs and profession names.', true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
