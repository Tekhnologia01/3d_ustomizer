"""
Django config package.
Installs PyMySQL as a MySQLdb drop-in if mysqlclient is not available.
"""
try:
    import MySQLdb  # mysqlclient installed — use it directly
except ImportError:
    try:
        import pymysql
        pymysql.install_as_MySQLdb()
    except ImportError:
        pass  # Neither installed — Django will show a clear error
