# Lista de verificación de C11 (N3). Métrica M4: proporción de requisitos cumplidos.
# Se evalúa sobre lo desplegado (estado) con las referencias de la configuración, para
# cualquier configuración del experimento (ver experimento/intencion/comun.rego).
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

# Entradas de los grupos de seguridad (IPv4 e IPv6). Con protocolo "-1" quedan abiertos
# todos los puertos, sea cual sea el rango escrito.
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

cumple contains "sg_web" if {
	some e in entradas
	internet(e.cidr)
	e.desde <= 443
	e.hasta >= 443
}

# El 5432 se abre a otro grupo de seguridad (en el estado, la regla guarda el id del grupo)
# y ninguna entrada lo abre a rangos de IP.
cumple contains "sg_bd" if {
	abierto_a_grupo(5432)
	not abierto_a_ip(5432)
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
