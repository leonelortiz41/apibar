import mysql2 from "mysql2"
import expres from "express"
import _ from "underscore"
import bodyParser from "body-parser"
import cors from "cors"
import nodemailer from 'nodemailer';
const app = expres();
// const PORT = process.env.PORT || 3000;
let milanesas = [], hamburguesas = [], lomitos = [], pizzas = [], papas = [], platos = [], empanadas = [], bebidas = [];
let pedidos = [], pedidosPost, date;
app.use(cors())
var jsonParser = bodyParser.json()
// var urlencodedParser = bodyParser.urlencoded({ extended: false })
import {
	DB_HOST,
	DB_USER,
	DB_DATABASE,
	DB_PASSWORD,
	DB_PORT,
	PORT
}
	from "./config.js"

app.listen(PORT, function () {
	console.log(`funcionando en el puerto ${PORT}`)
});

//conect to database mysql2
const conection = mysql2.createConnection({
	host: DB_HOST,
	user: DB_USER,
	password: DB_PASSWORD,
	database: DB_DATABASE,
	port: DB_PORT
})

conection.connect((err) => {
	if (err) {
		throw err;
		console.log(err.code);
	}
	else
		console.log("la conexion a la base de datos es exitosa");
});


app.use(expres.json({ limit: '50mb' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expres.urlencoded({ limit: '50mb', extended: true }));

app.post('/enviar-reporte', async (req, res) => {
	const { pdfBase64, fecha } = req.body;

	const transporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: 'c.leonelortiz10@gmail.com',
			pass: 'weqr xjfb lyzn upiq' // No es la clave normal, es una especial de Google
		}
	});
	console.log("llego a la ruta del servidor para enviar el mail")
	const mailOptions = {
		from: 'Bar Los Primos <c.leonelortiz10@gmail.com>',
		to: 'zulmalugones21@gmail.com, carlitoleonel@gmail.com',
		// zulmalugones21@gmail.com
		subject: `Cierre de Caja - ${fecha}`,
		text: 'Se adjunta el reporte de cierre de caja en formato PDF.',
		attachments: [{
			filename: `CIERRE_${fecha}.pdf`,
			content: pdfBase64,
			encoding: 'base64'
		}]
	};

	try {
		await transporter.sendMail(mailOptions);
		res.status(200).send("Correo enviado");
	} catch (error) {
		res.status(500).send(error.message);
		console.error("Error al enviar correo:", error);
	}
});

app.get('/milanesas', (req, res) => {
	extraerDatos(milanesas, "milanesas", res)
})
app.get('/lomitos', (req, res) => {
	extraerDatos(lomitos, "lomitos", res)

})
app.get('/hamburguesas', (req, res) => {
	extraerDatos(hamburguesas, "hamburguesas", res)

})
app.get('/pizzas', (req, res) => {
	extraerDatos(pizzas, "pizzas", res)

})
app.get('/papas', (req, res) => {
	extraerDatos(papas, "papas", res)

})
app.get('/platos', (req, res) => {
	extraerDatos(platos, "platos", res)

})
app.get('/empanadas', (req, res) => {
	extraerDatos(empanadas, "empanadas", res)

})
app.get('/bebidas', (req, res) => {
	extraerDatos(bebidas, "bebidas", res)

})
app.get('/pedidos', (req, res) => {
	extraerDatos(pedidos, "pedidos", res)

})

app.get('/date', (req, res) => {
	conection.query(`SELECT * from date`, (err, rows) => {
		if (err) throw err;
		else {
			let fecha = rows || "sin fecha"
			res.json(fecha)
		}
	})
})

app.get('/', (req, res) => {
	res.send("welcome")

})
app.post('/pedidos', jsonParser, (req, res) => {
	console.log("err   jnsasaj...")
	console.log(req.body)
	pedidosPost = req.body
	enviarData(pedidosPost)
	res.send(req.body)

})

app.post('/date', jsonParser, (req, res) => {
	console.log(req.body)
	let fecha = req.body.fecha
	conection.query(`INSERT INTO date (fecha) VALUES ("${fecha}")`, (err, rows) => {
		if (err) throw err;
		else
			console.log("la fecha se envio al servidor")
	})
	res.send(req.body)
})

app.delete("/pedidos/:id", (req, res) => {
	const { id } = req.params;

	// 1. Ejecutamos la consulta directamente usando el ID de la URL
	conection.query('DELETE FROM pedidos WHERE id = ?', [id], (error, results) => {
		if (error) {
			console.error("Error al borrar de la DB:", error);
			return res.status(500).json({ error: "Error al borrar el pedido" });
		}

		// 2. Si usas una variable local 'pedidos' para caché, debes filtrar el elemento borrado
		// NO hagas pedidos = [], eso borra TODOS los pedidos de la memoria
		pedidos = pedidos.filter(p => p.id != id);

		console.log(`Pedido #${id} borrado correctamente`);

		// 3. Respondemos éxito
		res.json({ mensaje: "Pedido eliminado", id });
	});
});

app.delete('/date', (req, res) => {
	conection.query(`DELETE FROM date`)
	console.log("se borro la fecha")
	res.send("se borro la fecha")
})

app.put("/pedidos/:id", jsonParser, (req, res) => {
	const { id } = req.params;
	// let {cantidad,cliente,detalle,importe,detalleTicket}=req.body
	pedidosPost = req.body
	console.log("se realizo metodo put y los nuevos datos son:");
	console.log(req.body)

	editarData(pedidosPost, id);

	res.send(req.body)
	// pedidos=[]
})


app.put("/pj/:id", jsonParser, (req, res) => {
	const { id } = req.params;
	let pj = req.body
	console.log("se realizo metodo put y los nuevos datos son:", pj);
	conection.query(`UPDATE pedidos SET pj = '${pj.pj}' WHERE pedidos.id = ${id}`, (err, rows) => {
		if (err) throw err;
		else
			console.log("los nuevos datos se actualizaron correctamente")
	})
	res.send(req.body)
})
app.put("/statu/:id", jsonParser, (req, res) => {
	const { id } = req.params;
	let statu = req.body
	console.log("se realizo metodo put y los nuevos datos son:", statu);
	conection.query(`UPDATE pedidos SET statu = '${statu.statu}' WHERE pedidos.id = ${id}`, (err, rows) => {
		if (err) throw err;
		else
			console.log("los nuevos datos se actualizaron correctamente")
	})
	res.send(req.body)
})
app.put("/pagado/:id", jsonParser, (req, res) => {
	const { id } = req.params;
	let pagado = req.body
	console.log("se realizo metodo put y los nuevos datos son:", pagado);
	conection.query(`UPDATE pedidos SET pagado = '${pagado.pagado}' WHERE pedidos.id = ${id}`, (err, rows) => {
		if (err) throw err;
		else
			console.log("los nuevos datos se actualizaron correctamente")
	})
	res.send(req.body)
})

app.delete('/pedidos', (req, res) => {
	pedidos = [];
	borrarDatos("pedidos")
	res.send("se borraron los registros")
})

// Obtener todos los repartidores
app.get('/repartidores', (req, res) => {
	let repartidores = []; // Variable temporal para la función extraerDatos
	extraerDatos(repartidores, "repartidores", res);
});

// Agregar un nuevo repartidor
app.post('/repartidores', (req, res) => {
	console.log("---------------------------");
	console.log("PETICIÓN RECIBIDA EN /repartidores");
	console.log("BODY:", req.body);

	const { nombre } = req.body;

	if (!nombre) {
		console.log("ERROR: Nombre no recibido");
		return res.status(400).send("Falta el nombre");
	}

	const query = `INSERT INTO repartidores (nombre) VALUES ("${nombre}")`;
	conection.query(query, (err, rows) => {
		if (err) {
			console.error("ERROR SQL:", err);
			res.status(500).send("Error de DB");
		} else {
			console.log("Repartidor insertado con ID:", rows.insertId);
			res.status(201).json({ id: rows.insertId, nombre });
		}
	});
});

// Eliminar un repartidor
app.delete('/repartidores/:id', (req, res) => {
	const { id } = req.params;
	conection.query(`DELETE FROM repartidores WHERE id = ${id}`, (err, rows) => {
		if (err) throw err;
		res.status(200).send("Repartidor eliminado");
	});
});
// Editar nombre de repartidor
// 1. COLOCA ESTO ARRIBA DE LAS RUTAS DINÁMICAS (/:product/:id)
app.put('/repartidores/:id', (req, res) => {
	const { id } = req.params;
	const { nombre } = req.body;

	console.log("Editando repartidor ID:", id, "Nuevo nombre:", nombre);

	if (!nombre) return res.status(400).send("Falta el nombre");

	// SQL corregido: Solo actualiza nombre, no busca la columna precio
	const query = `UPDATE repartidores SET nombre = "${nombre.toUpperCase()}" WHERE id = ${id}`;

	conection.query(query, (err, rows) => {
		if (err) {
			console.error("Error SQL:", err);
			return res.status(500).send("Error al actualizar");
		}
		res.status(200).send("Repartidor actualizado");
	});
});


// --- GESTIÓN DE CONFIGURACIÓN (ADICIONES Y COMISIONES) ---

// Obtener todos los ajustes
app.get('/configuracion', (req, res) => {
	// Usamos la función auxiliar que ya tienes
	extraerDatos([], "configuracion", res);
});

// Agregar o Actualizar configuración (Upsert)
app.post('/configuracion', jsonParser, (req, res) => {
	const { atributo, valor, tipo } = req.body;

	// Validamos que lleguen los datos necesarios (valor puede ser 0, por eso checkeamos undefined)
	if (!atributo || valor === undefined || !tipo) {
		return res.status(400).send("Faltan datos: atributo, valor y tipo son obligatorios");
	}

	// Usamos ON DUPLICATE KEY UPDATE para manejar el insert/update automáticamente
	// IMPORTANTE: La columna 'atributo' debe ser UNIQUE en tu tabla MySQL
	const query = `
        INSERT INTO configuracion (atributo, valor, tipo) 
        VALUES ("${atributo.toUpperCase()}", "${valor}", "${tipo.toLowerCase()}")
        ON DUPLICATE KEY UPDATE 
            valor = "${valor}", 
            tipo = "${tipo.toLowerCase()}"
    `;

	conection.query(query, (err, rows) => {
		if (err) {
			console.error("Error en POST /configuracion:", err);
			return res.status(500).send("Error de base de datos");
		}

		// Si rows.affectedRows es 1 fue Insert, si es 2 fue Update
		const status = rows.affectedRows === 1 ? 201 : 200;
		res.status(status).json({
			id: rows.insertId || null,
			atributo,
			valor,
			tipo
		});
	});
});

// Eliminar ajuste
app.delete('/configuracion/:id', (req, res) => {
	const { id } = req.params;
	conection.query(`DELETE FROM configuracion WHERE id = ${id}`, (err, rows) => {
		if (err) {
			console.error(err);
			return res.status(500).send("Error al eliminar");
		}
		res.status(200).send("Configuración eliminada");
	});
});

// --- RUTA PARA AGREGAR PRODUCTO NUEVO ---
app.post('/:product', jsonParser, (req, res) => {
	const { product } = req.params;
	const { nombre, precio } = req.body;

	// Validamos que el nombre y precio existan
	if (!nombre || !precio) return res.status(400).send("Faltan datos");

	const query = `INSERT INTO ${product} (nombre, precio) VALUES ("${nombre}", "${precio}")`;

	conection.query(query, (err, rows) => {
		if (err) {
			console.error(err);
			res.status(500).send("Error al insertar");
		} else {
			console.log(`Nuevo item agregado a ${product}`);
			res.status(201).json({ id: rows.insertId, nombre, precio });
		}
	});
});

// --- RUTA PARA BORRAR PRODUCTO ---
app.delete('/:product/:id', (req, res) => {
	const { product, id } = req.params;

	const query = `DELETE FROM ${product} WHERE id = ${id}`;

	conection.query(query, (err, rows) => {
		if (err) {
			console.error(err);
			res.status(500).send("Error al eliminar");
		} else {
			console.log(`Item ${id} eliminado de ${product}`);
			res.status(200).send("Eliminado correctamente");
		}
	});
});

app.put("/:product/:id", jsonParser, (req, res) => {
	const { product, id } = req.params;
	let newPrice = req.body
	console.log(product)
	console.log("se realizo metodo put y los nuevos datos son:", newPrice);
	conection.query(`UPDATE ${product} SET precio = '${newPrice.precio}' WHERE ${product}.id = ${id}`, (err, rows) => {
		if (err) throw err;
		else
			console.log("los nuevos datos se actualizaron correctamente")
	})
	res.send(req.body)
})

app.use((req, res, next) => {
	res.status(404).json({
		message: "no se obtuvo respuesta..."
	})
})

//funciones

const extraerDatos = function (table, sql, res) {
	conection.query(`SELECT * from ${sql}`, (err, rows) => {
		if (err) {
			console.error(err);
			res.status(500).send("Error de servidor");
		} else {
			// Devolvemos directamente las filas de la base de datos
			res.json(rows);
		}
	});
}

const borrarDatos = function (sql) {
	conection.query(`TRUNCATE TABLE pedidos`)
	console.log("se borraron todos los registros")
}
const enviarData = function (pedidosPost) {
	let cantidad = pedidosPost.cantidad;
	let detalle = "";
	let detalleTicket = pedidosPost.detalle
	let cliente = pedidosPost.cliente
	let importe = pedidosPost.importe
	let statu = pedidosPost.statu
	let pagado = pedidosPost.pagado
	let pj = pedidosPost.pj

	for (let i = 0; i < pedidosPost.pedido.length; i++) {
		let serializado = JSON.stringify(pedidosPost.pedido[i])
		if (detalle == "") detalle = serializado;
		else detalle = detalle + `,` + serializado;
	}
	pedidosPost = "";
	conection.query(`INSERT INTO pedidos (cantidad, cliente, detalle, importe, detalleTicket, statu, pagado, pj) VALUES ("${cantidad}","${cliente}", '${detalle}', "${importe}","${detalleTicket}","${statu}","${pagado}","${pj}")`, (err, rows) => {
		if (err) throw err;
		else
			console.log("los nuevos datos se enviaron correctamente")
	})
	pedidos = [];
}

const editarData = function (pedidosPost, id) {
	let cantidad = pedidosPost.cantidad;
	let detalle = "";
	let detalleTicket = pedidosPost.detalle
	let cliente = pedidosPost.cliente
	let importe = pedidosPost.importe

	for (let i = 0; i < pedidosPost.pedido.length; i++) {
		let serializado = JSON.stringify(pedidosPost.pedido[i])
		if (detalle == "") detalle = serializado;
		else detalle = detalle + `,` + serializado;
	}
	pedidosPost = "";
	conection.query(`UPDATE pedidos SET cliente = '${cliente}', detalle = '${detalle}', importe = '${importe}', detalleTicket = '${detalleTicket}', cantidad = '${cantidad}' WHERE pedidos.id = ${id}`, (err, rows) => {
		if (err) throw err;
		else
			console.log("los nuevos datos se actualizaron correctamente")
	})
	pedidos = [];
}


// conection.end();