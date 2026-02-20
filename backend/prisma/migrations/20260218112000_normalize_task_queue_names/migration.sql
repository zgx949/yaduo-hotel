UPDATE "TaskModuleConfig"
SET "queueName" = REPLACE(REPLACE(REPLACE(REPLACE("queueName", ':', '-'), ' ', '-'), '/', '-'), '\\', '-')
WHERE "queueName" LIKE '%:%'
   OR "queueName" LIKE '% %'
   OR "queueName" LIKE '%/%'
   OR "queueName" LIKE '%\\%';

UPDATE "TaskRun"
SET "queueName" = REPLACE(REPLACE(REPLACE(REPLACE("queueName", ':', '-'), ' ', '-'), '/', '-'), '\\', '-')
WHERE "queueName" LIKE '%:%'
   OR "queueName" LIKE '% %'
   OR "queueName" LIKE '%/%'
   OR "queueName" LIKE '%\\%';
