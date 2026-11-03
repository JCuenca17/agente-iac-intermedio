# Lista de verificación de R2 (proyecto real). Métrica M4: proporción de requisitos cumplidos.
# Proyecto: jcolemorrison/vault-on-aws (MIT). Los requisitos salen de la sección
# "Architecture" de su README (red, entrada del tráfico, servidores, almacenamiento y recursos
# de operador). Se evalúa sobre lo desplegado (estado) con las referencias de la configuración
# (ver experimento/intencion/comun.rego).
package intencion.r2

import rego.v1

import data.intencion.comun

nivel := "PR"

requisitos := {
	"red": "Hay una VPC con subredes públicas y privadas",
	"balanceador": "Un balanceador de aplicaciones público",
	"https": "El balanceador atiende HTTPS con un certificado de ACM y redirige HTTP a HTTPS",
	"sg_balanceador": "El grupo del balanceador solo admite los puertos 80 y 443 desde internet",
	"autoescalado": "Un grupo de autoescalado de al menos dos instancias creadas desde una plantilla de lanzamiento",
	"instancias_privadas": "Las instancias reciben tráfico solo desde otros grupos de seguridad, no desde internet",
	"almacenamiento": "Una tabla de DynamoDB en modo bajo demanda",
	"sellado": "Una clave de KMS",
	"endpoints": "Endpoints de VPC para DynamoDB y KMS",
	"bucket": "Un bucket de S3 privado y cifrado",
	"rol": "Las instancias tienen un rol de IAM sin acciones comodín",
	"operador": "Hay un bastión y un NAT para la primera instalación",
}

cumple contains "red" if {
	comun.hay("aws_vpc")
	publicas := [s | some s in comun.recursos("aws_subnet"); s.values.map_public_ip_on_launch == true]
	privadas := [s | some s in comun.recursos("aws_subnet"); s.values.map_public_ip_on_launch != true]
	count(publicas) > 0
	count(privadas) > 0
}

# Subredes públicas también por la ruta a internet de su tabla, cuando no asignan IP pública.
cumple contains "red" if {
	comun.hay("aws_vpc")
	count(comun.recursos("aws_subnet")) >= 2
	comun.hay("aws_internet_gateway")
	comun.hay("aws_nat_gateway")
}

cumple contains "balanceador" if {
	some b in comun.recursos("aws_lb")
	b.values.load_balancer_type == "application"
	b.values.internal == false
}

cumple contains "https" if {
	some l in comun.recursos("aws_lb_listener")
	l.values.protocol == "HTTPS"
	comun.con_valor(l.values.certificate_arn)
	comun.hay("aws_acm_certificate")
	some r in comun.recursos("aws_lb_listener")
	r.values.protocol == "HTTP"
	some a in r.values.default_action
	a.type == "redirect"
	some d in a.redirect
	d.protocol == "HTTPS"
}

# Entradas de cada grupo de seguridad (en el grupo o en reglas sueltas), IPv4 e IPv6.
entradas contains {"grupo": g.values.id, "desde": i.from_port, "hasta": i.to_port, "cidr": c} if {
	some g in comun.recursos("aws_security_group")
	some i in g.values.ingress
	some c in array.concat(object.get(i, "cidr_blocks", []), object.get(i, "ipv6_cidr_blocks", []))
}

entradas contains {"grupo": r.values.security_group_id, "desde": r.values.from_port, "hasta": r.values.to_port, "cidr": c} if {
	some r in comun.recursos("aws_security_group_rule")
	r.values.type == "ingress"
	some c in array.concat(object.get(r.values, "cidr_blocks", []), object.get(r.values, "ipv6_cidr_blocks", []))
}

internet(c) if c in {"0.0.0.0/0", "::/0"}

grupos_del_balanceador := {g | some b in comun.recursos("aws_lb"); some g in b.values.security_groups}

cumple contains "sg_balanceador" if {
	count(grupos_del_balanceador) > 0
	abiertas := [e | some e in entradas; e.grupo in grupos_del_balanceador; internet(e.cidr)]
	count(abiertas) > 0
	every e in abiertas {
		e.desde == e.hasta
		e.desde in {80, 443}
	}
}

cumple contains "autoescalado" if {
	some a in comun.recursos("aws_autoscaling_group")
	a.values.min_size >= 2
	count(object.get(a.values, "launch_template", [])) > 0
}

grupos_de_instancias := {g |
	some p in comun.recursos("aws_launch_template")
	some g in object.get(p.values, "vpc_security_group_ids", [])
}

cumple contains "instancias_privadas" if {
	count(grupos_de_instancias) > 0
	every e in entradas {
		not instancia_abierta(e)
	}
}

instancia_abierta(e) if {
	e.grupo in grupos_de_instancias
	comun.con_valor(e.cidr)
}

cumple contains "almacenamiento" if {
	some t in comun.recursos("aws_dynamodb_table")
	t.values.billing_mode == "PAY_PER_REQUEST"
}

cumple contains "sellado" if comun.hay("aws_kms_key")

cumple contains "endpoints" if {
	servicios := {e.values.service_name | some e in comun.recursos("aws_vpc_endpoint")}
	some d in servicios
	endswith(d, ".dynamodb")
	some k in servicios
	endswith(k, ".kms")
}

cumple contains "bucket" if {
	comun.hay("aws_s3_bucket")
	comun.conecta("aws_s3_bucket_server_side_encryption_configuration", "bucket", "aws_s3_bucket")
	comun.conecta("aws_s3_bucket_public_access_block", "bucket", "aws_s3_bucket")
	some b in comun.recursos("aws_s3_bucket_public_access_block")
	b.values.block_public_acls == true
	b.values.block_public_policy == true
	b.values.ignore_public_acls == true
	b.values.restrict_public_buckets == true
}

cumple contains "rol" if {
	comun.hay("aws_iam_instance_profile")
	count(comun.acciones_iam) > 0
	every a in comun.acciones_iam {
		a != "*"
		not endswith(a, ":*")
	}
}

cumple contains "operador" if {
	comun.hay("aws_instance")
	comun.hay("aws_nat_gateway")
}
