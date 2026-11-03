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
	ruta_por_defecto
}

ruta_por_defecto if {
	some t in comun.recursos("aws_route_table")
	some r in t.values.route
	r.cidr_block == "0.0.0.0/0"
}

ruta_por_defecto if {
	some r in comun.recursos("aws_route")
	r.values.destination_cidr_block == "0.0.0.0/0"
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

# Entradas de los grupos de seguridad (IPv4 e IPv6), igual que en C11.
entradas contains {"desde": d, "hasta": h, "cidr": c} if {
	some g in comun.recursos("aws_security_group")
	some i in g.values.ingress
	some c in array.concat(object.get(i, "cidr_blocks", []), object.get(i, "ipv6_cidr_blocks", []))
	[d, h] := puertos(i.protocol, i.from_port, i.to_port)
}

entradas contains {"desde": d, "hasta": h, "cidr": c} if {
	some r in comun.recursos("aws_vpc_security_group_ingress_rule")
	some c in [r.values.cidr_ipv4, r.values.cidr_ipv6]
	comun.con_valor(c)
	[d, h] := puertos(r.values.ip_protocol, r.values.from_port, r.values.to_port)
}

puertos(protocolo, desde, hasta) := [0, 65535] if protocolo in {"-1", "all"}

puertos(protocolo, desde, hasta) := [desde, hasta] if not protocolo in {"-1", "all"}

internet(cidr) if cidr in {"0.0.0.0/0", "::/0"}

# Puerto abierto a otro grupo de seguridad (en el estado, la regla guarda el id del grupo)
# y a ningún rango de IP.
abierto_solo_a_grupos(puerto) if {
	abierto_a_grupo(puerto)
	not abierto_a_ip(puerto)
}

abierto_a_grupo(puerto) if {
	some g in comun.recursos("aws_security_group")
	some i in g.values.ingress
	[d, h] := puertos(i.protocol, i.from_port, i.to_port)
	d <= puerto
	h >= puerto
	count(object.get(i, "security_groups", [])) > 0
}

abierto_a_grupo(puerto) if {
	some r in comun.recursos("aws_vpc_security_group_ingress_rule")
	[d, h] := puertos(r.values.ip_protocol, r.values.from_port, r.values.to_port)
	d <= puerto
	h >= puerto
	comun.con_valor(r.values.referenced_security_group_id)
}

abierto_a_ip(puerto) if {
	some e in entradas
	e.desde <= puerto
	e.hasta >= puerto
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
	comun.conecta("aws_s3_bucket_public_access_block", "bucket", "aws_s3_bucket")
	some b in comun.recursos("aws_s3_bucket_public_access_block")
	b.values.block_public_acls == true
	b.values.block_public_policy == true
	b.values.ignore_public_acls == true
	b.values.restrict_public_buckets == true
}

cumple contains "logs" if {
	some g in comun.recursos("aws_cloudwatch_log_group")
	g.values.retention_in_days == 30
}

cumple contains "flujo_red" if comun.conecta("aws_flow_log", "vpc_id", "aws_vpc")

# La misma alarma vigila la CPU de la base de datos y avisa por SNS.
cumple contains "alarma" if {
	some a in comun.recursos("aws_cloudwatch_metric_alarm")
	a.values.metric_name == "CPUUtilization"
	a.values.namespace == "AWS/RDS"
	some c in comun.config("aws_cloudwatch_metric_alarm")
	sin_indice(a.address) == c.address
	some ref in comun.referencias(object.get(c.expressions, "alarm_actions", {}))
	startswith(ref, "aws_sns_topic.")
}

sin_indice(direccion) := regex.replace(direccion, `\[[^\]]*\]$`, "")

cumple contains "sin_puertos_abiertos" if {
	count(entradas) > 0
	every e in entradas {
		permitida(e)
	}
}

permitida(e) if not internet(e.cidr)

permitida(e) if {
	e.desde == e.hasta
	e.desde in {80, 443}
}
