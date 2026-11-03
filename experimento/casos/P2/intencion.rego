# Lista de verificación de P2 (proyecto grande: aplicación web de tres capas). Métrica M4.
# Se evalúa sobre lo desplegado (estado) con las referencias de la configuración.
package intencion.p2

import rego.v1

import data.intencion.comun

nivel := "PG"

requisitos := {
	"vpc": "Existe una VPC",
	"subredes": "Hay al menos cuatro subredes en al menos dos zonas",
	"internet": "Hay puerta de enlace a internet con ruta 0.0.0.0/0",
	"nat": "Hay un NAT para las subredes privadas",
	"balanceador": "Un balanceador de aplicaciones público con un listener",
	"destino": "Un grupo de destino en el puerto 8080 con comprobación de salud en /salud",
	"autoescalado": "Un grupo de autoescalado con mínimo 2 y máximo 4",
	"plantilla": "Una plantilla de lanzamiento con instancias t3.micro",
	"escalado_cpu": "Una política de escalado por CPU",
	"web_desde_balanceador": "El puerto 8080 solo se abre a otro grupo de seguridad",
	"base_datos": "Una base PostgreSQL cifrada, sin acceso público y con copias de 7 días",
	"bd_desde_web": "El puerto 5432 solo se abre a otro grupo de seguridad",
	"archivos": "Un bucket privado, versionado y cifrado",
	"logs": "Hay un grupo de logs con retención de 30 días",
	"flujo_red": "La VPC tiene registros de flujo",
	"alarma": "Una alarma de CPU de la base de datos avisa por SNS",
	"sin_puertos_abiertos": "Hacia internet solo están abiertos los puertos 80 y 443",
}

cumple contains "vpc" if comun.hay("aws_vpc")

cumple contains "subredes" if {
	subredes := comun.recursos("aws_subnet")
	count(subredes) >= 4
	count({s.values.availability_zone | some s in subredes}) >= 2
}

cumple contains "internet" if {
	comun.hay("aws_internet_gateway")
	some t in comun.recursos("aws_route_table")
	some r in t.values.route
	r.cidr_block == "0.0.0.0/0"
}

cumple contains "nat" if comun.hay("aws_nat_gateway")

cumple contains "balanceador" if {
	some b in comun.recursos("aws_lb")
	b.values.load_balancer_type == "application"
	b.values.internal == false
	comun.hay("aws_lb_listener")
}

cumple contains "destino" if {
	some g in comun.recursos("aws_lb_target_group")
	g.values.port == 8080
	g.values.health_check[0].path == "/salud"
}

cumple contains "autoescalado" if {
	some a in comun.recursos("aws_autoscaling_group")
	a.values.min_size == 2
	a.values.max_size == 4
}

cumple contains "plantilla" if {
	some p in comun.recursos("aws_launch_template")
	p.values.instance_type == "t3.micro"
}

cumple contains "escalado_cpu" if {
	some p in comun.recursos("aws_autoscaling_policy")
	contains(lower(json.marshal(p.values)), "cpu")
}

entradas contains {"g": g.address, "desde": i.from_port, "hasta": i.to_port, "cidrs": i.cidr_blocks} if {
	some g in comun.recursos("aws_security_group")
	some i in g.values.ingress
}

# Puerto abierto solo a grupos de seguridad (sin rangos de IP), con referencia en la configuración.
abierto_solo_a_grupos(puerto) if {
	some g in comun.recursos("aws_security_group")
	some i in g.values.ingress
	i.from_port <= puerto
	i.to_port >= puerto
	count(i.cidr_blocks) == 0
	some r in comun.config("aws_security_group")
	r.address == g.address
	some ref in comun.referencias(r.expressions.ingress)
	startswith(ref, "aws_security_group.")
}

abierto_solo_a_grupos(puerto) if {
	some r in comun.config("aws_vpc_security_group_ingress_rule")
	r.expressions.from_port.constant_value <= puerto
	r.expressions.to_port.constant_value >= puerto
	count(comun.referencias(r.expressions.referenced_security_group_id)) > 0
}

cumple contains "web_desde_balanceador" if abierto_solo_a_grupos(8080)

cumple contains "bd_desde_web" if abierto_solo_a_grupos(5432)

cumple contains "base_datos" if {
	some d in comun.recursos("aws_db_instance")
	d.values.engine == "postgres"
	d.values.storage_encrypted == true
	d.values.publicly_accessible == false
	d.values.backup_retention_period >= 7
}

cumple contains "archivos" if {
	comun.conecta("aws_s3_bucket_versioning", "bucket", "aws_s3_bucket")
	comun.conecta("aws_s3_bucket_server_side_encryption_configuration", "bucket", "aws_s3_bucket")
	some b in comun.recursos("aws_s3_bucket_public_access_block")
	b.values.block_public_acls == true
	b.values.restrict_public_buckets == true
}

cumple contains "logs" if {
	some g in comun.recursos("aws_cloudwatch_log_group")
	g.values.retention_in_days == 30
}

cumple contains "flujo_red" if comun.conecta("aws_flow_log", "vpc_id", "aws_vpc")

cumple contains "alarma" if {
	some a in comun.recursos("aws_cloudwatch_metric_alarm")
	a.values.metric_name == "CPUUtilization"
	comun.conecta("aws_cloudwatch_metric_alarm", "alarm_actions", "aws_sns_topic")
}

cumple contains "sin_puertos_abiertos" if {
	count(entradas) > 0
	every e in entradas {
		permitida(e)
	}
}

permitida(e) if not "0.0.0.0/0" in e.cidrs

permitida(e) if {
	e.desde == e.hasta
	e.desde in {80, 443}
}
