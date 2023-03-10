import mysql2 from "mysql2"
import expres from "express"
import _ from "underscore"
import bodyParser from "body-parser"
import cors from "cors"
const app = expres();
// const PORT = process.env.PORT || 3000;
let milanesas = [], hamburguesas = [], lomitos = [], pizzas = [], papas = [], platos = [], empandas = [], bebidas = [];
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

app.listen(DB_PORT, function () {
	console.log(`funcionando en el puerto ${DB_PORT}`)
});

//conect to database mysql2
const conection = mysql2.createConnection({
	host: DB_HOST,
	user: DB_USER,
	password: DB_PASSWORD,
	database: DB_DATABASE,
	port: PORT
})

conection.connect((err) => {
	if (err) {
		throw err;
		console.log(err.code);
	}
	else
		console.log("la conexion a la base de datos es exitosa");
});

//rauters
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
	_.each(pedidos, (pedido, i) => {
		if (pedido.id != null && pedido.id == id) {
			conection.query(`DELETE FROM pedidos WHERE pedidos.id = ${id}`)
			console.log(id)

		}
	}
	)
	res.json(req.body)
	console.log(req.body)
	pedidos = []
})

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
	console.log("se realizo metodo put y los nuevos datos son:",pj);
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
	console.log("se realizo metodo put y los nuevos datos son:",statu);
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
	console.log("se realizo metodo put y los nuevos datos son:",pagado);
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
app.use((req, res, next) => {
	res.status(404).json({
		message: "no se obtuvo respuesta..."
	})
})

//funciones
const extraerDatos = async function (table, sql, res) {
	conection.query(`SELECT * from ${sql}`, async (err, rows) => {
		if (err)
			throw err;


		else
			for (var i = 0; i < rows.length; i++) {
				table[i] = await rows[i];
			}
		res.json(table)
	})
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