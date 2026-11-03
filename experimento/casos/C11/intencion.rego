# Lista de verificación de C11 (N3). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre el plan (tofu show -json) de cualquier configuración.
package intencion.c11

import rego.v1

import data.intencion.comun

nivel := "N3"

requisitos := {
	"vpc": "Existe una VPC",
	"subredes": "Existen al menos dos subredes",
	"internet": "Hay una puerta de enlace a internet con una ruta 0.0.0.0/0",
	"sg_web": "Un grupo de seguridad acepta el puerto 443 desde internet",
	"sg_bd": "El acceso al puerto 5432 se limita a otro grupo de seguridad",
	"sin_puertos_abiertos": "Ningún puerto distinto de 80 y 443 está abierto a internet",
}

cumple contains "vpc" if comun.hay("aws_vpc")

cumple contains "subredes" if count(comun.recursos("aws_subnet")) >= 2

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

entradas contains {"desde": d, "hasta": h, "cidr": c} if {
	some g in comun.recursos("aws_security_group")
	some i in g.values.ingress
	some c in i.cidr_blocks
	d := i.from_port
	h := i.to_port
}

entradas contains {"desde": r.values.from_port, "hasta": r.values.to_port, "cidr": r.values.cidr_ipv4} if {
	some r in comun.recursos("aws_vpc_security_group_ingress_rule")
	r.values.cidr_ipv4 != null
}

cumple contains "sg_web" if {
	some e in entradas
	e.cidr == "0.0.0.0/0"
	e.desde <= 443
	e.hasta >= 443
}

# Reglas dentro del grupo: el puerto está en los valores planeados y la referencia al
# otro grupo, en la expresión de "ingress" de la configuración.
cumple contains "sg_bd" if {
	some g in comun.recursos("aws_security_group")
	some i in g.values.ingress
	i.from_port <= 5432
	i.to_port >= 5432
	count(i.cidr_blocks) == 0
	some r in comun.config("aws_security_group")
	r.address == g.address
	some ref in comun.referencias(r.expressions.ingress)
	startswith(ref, "aws_security_group.")
}

cumple contains "sg_bd" if {
	some r in comun.config("aws_vpc_security_group_ingress_rule")
	r.expressions.from_port.constant_value == 5432
	count(comun.referencias(r.expressions.referenced_security_group_id)) > 0
}

cumple contains "sin_puertos_abiertos" if {
	count(entradas) > 0
	every e in entradas {
		permitida(e)
	}
}

permitida(e) if e.cidr != "0.0.0.0/0"

permitida(e) if {
	e.desde == e.hasta
	e.desde in {80, 443}
}
