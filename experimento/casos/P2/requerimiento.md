Necesito la infraestructura de una aplicación web clásica de tres capas:

- Una VPC en dos zonas de disponibilidad, con una subred pública y una privada en cada zona. Las subredes públicas salen a internet por una puerta de enlace; las privadas salen por un NAT.
- Un balanceador de carga de aplicaciones público, en las subredes públicas, que acepte HTTP y HTTPS desde internet y reparta el tráfico al puerto 8080 de los servidores web, con una comprobación de salud en /salud.
- Los servidores web corren en un grupo de autoescalado (mínimo 2, máximo 4, en las subredes privadas) a partir de una plantilla de lanzamiento con instancias t3.micro, y escalan según el uso de CPU. Solo aceptan tráfico del balanceador. Tienen un rol que les permite leer y escribir en el bucket de archivos y escribir sus logs.
- Una base de datos PostgreSQL 16 en las subredes privadas, cifrada, sin acceso público, con copias de seguridad de 7 días, que solo acepte conexiones desde los servidores web. La contraseña la administra AWS.
- Un bucket de S3 privado, versionado y cifrado para los archivos que suben los usuarios.
- Un grupo de logs de la aplicación con retención de 30 días, registros de flujo de la VPC hacia CloudWatch Logs y una alarma que avise por un tema de SNS si la CPU de la base de datos pasa del 80 %.
