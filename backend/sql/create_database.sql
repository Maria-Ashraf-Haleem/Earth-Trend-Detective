-- Additive bootstrap. Run with Windows Authentication against master.
IF DB_ID(N'earthtrend_db') IS NULL
BEGIN
    CREATE DATABASE [earthtrend_db];
END;
